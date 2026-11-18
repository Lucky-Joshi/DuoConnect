import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { socketAuth } from '../middleware/auth.js';
import { markDeliveredForUser } from '../modules/messages/messages.service.js';
import { handleUserDisconnect } from '../modules/calls/calls.service.js';
import { realtime } from './events.js';
import {
  addConnection,
  getFriendPresence,
  removeConnection,
  setUserStatus,
  touchPresence,
} from './presence.js';
import registerChatHandlers from './handlers/chat.handler.js';
import registerCallHandlers from './handlers/call.handler.js';
import { registerHandler } from './handlers/shared.js';

const HEARTBEAT_MS = 30_000;

let io = null;
let bridge = null;

export function userRoom(userId) {
  return `user:${userId}`;
}

async function bootstrap(socket) {
  const userId = socket.data.userId;
  socket.join(userRoom(userId));
  await addConnection(userId, socket.id);

  const chat = registerChatHandlers(socket);
  registerCallHandlers(socket);

  registerHandler(socket, 'presence:set', async (payload) => {
    const status = payload?.status;
    await setUserStatus(userId, status);
    return { status };
  });

  registerHandler(socket, 'presence:touch', async () => {
    await touchPresence(userId);
    return { ok: true };
  });

  socket.emit('session:ready', {
    socketId: socket.id,
    userId,
    serverTime: new Date().toISOString(),
  });

  const heartbeat = setInterval(() => {
    touchPresence(userId).catch(() => {});
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    clearInterval(heartbeat);
    chat.cleanup();
    try {
      const lastConnection = await removeConnection(userId, socket.id);
      if (lastConnection) await handleUserDisconnect(userId);
    } catch (error) {
      logger.warn({ err: error, userId }, 'Connection cleanup failed');
    }
  };
  socket.once('disconnect', cleanup);

  // Deliver anything that arrived while the user was offline, and hydrate
  // friend presence so the sidebar is correct on first paint.
  const [presence, delivered] = await Promise.allSettled([
    getFriendPresence(userId),
    markDeliveredForUser(userId),
  ]);
  if (presence.status === 'fulfilled') {
    socket.emit('presence:snapshot', { friends: presence.value });
  } else {
    logger.warn({ err: presence.reason, userId }, 'Could not load friend presence');
  }
  if (delivered.status === 'fulfilled' && delivered.value.delivered > 0) {
    socket.emit('message:delivered', delivered.value);
  }
}

export function initRealtime(httpServer) {
  if (io) return io;

  io = new Server(httpServer, {
    path: '/socket.io',
    serveClient: false,
    maxHttpBufferSize: 1_000_000,
    pingInterval: 25_000,
    pingTimeout: 20_000,
    cors: {
      origin: env.clientOrigins,
      credentials: true,
      methods: ['GET', 'POST'],
    },
  });

  io.use(socketAuth);

  bridge = ({ userId, event, payload }) => {
    io?.to(userRoom(userId)).emit(event, payload);
  };
  realtime.on('user:event', bridge);

  io.on('connection', (socket) => {
    bootstrap(socket).catch((error) => {
      logger.error(
        { err: error, userId: socket.data.userId, socketId: socket.id },
        'Socket bootstrap failed',
      );
      socket.emit('session:error', { message: 'Could not start the realtime session.' });
      socket.disconnect(true);
    });
  });

  logger.info('Realtime gateway ready');
  return io;
}

export function getIO() {
  return io;
}

export async function closeRealtime() {
  if (!io) return;
  if (bridge) realtime.off('user:event', bridge);
  bridge = null;
  await new Promise((resolve) => io.close(resolve));
  io = null;
}
