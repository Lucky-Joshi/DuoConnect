import { io } from 'socket.io-client';

const SOCKET_URL = (import.meta.env.VITE_API_URL || window.location.origin).replace(/\/$/, '');

let socket = null;
let currentToken = null;

export function connectSocket(token) {
  if (!token) return null;

  if (socket) {
    if (currentToken !== token) {
      currentToken = token;
      socket.auth = { token };
      if (socket.connected) {
        socket.disconnect().connect();
      } else {
        socket.connect();
      }
    } else if (!socket.connected && !socket.active) {
      socket.connect();
    }
    return socket;
  }

  currentToken = token;
  socket = io(SOCKET_URL, {
    auth: { token },
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 600,
    reconnectionDelayMax: 5000,
    timeout: 12_000,
  });
  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  currentToken = null;
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
}

/**
 * Emit a socket event and resolve only when the server acknowledges success.
 * Rejects with a readable Error carrying the server error code.
 */
export function emitWithAck(event, payload, timeoutMs = 12_000) {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) {
      const offline = new Error('You are offline. Reconnecting…');
      offline.code = 'SOCKET_OFFLINE';
      reject(offline);
      return;
    }

    socket.timeout(timeoutMs).emit(event, payload, (timeoutError, ack) => {
      if (timeoutError) {
        reject(new Error('The server took too long to respond. Please try again.'));
        return;
      }
      if (!ack?.ok) {
        const error = new Error(ack?.error?.message || 'That action could not be completed.');
        error.code = ack?.error?.code || 'SOCKET_ERROR';
        error.details = ack?.error?.details ?? null;
        reject(error);
        return;
      }
      resolve(ack.data);
    });
  });
}

export function emitEvent(event, payload) {
  if (socket?.connected) socket.emit(event, payload);
}
