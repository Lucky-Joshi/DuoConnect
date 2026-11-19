import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { pushDiagnostics, pushEnabled } from './config/push.js';
import { dbMode } from './db/index.js';
import { AppError } from './utils/errors.js';
import { globalLimiter } from './middleware/rate-limit.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import authRoutes from './modules/auth/auth.routes.js';
import userRoutes from './modules/users/users.routes.js';
import friendRoutes from './modules/friends/friends.routes.js';
import chatRoutes from './modules/chats/chats.routes.js';
import messageRoutes from './modules/messages/messages.routes.js';
import uploadRoutes from './modules/uploads/uploads.routes.js';
import notificationRoutes from './modules/notifications/notifications.routes.js';
import callRoutes from './modules/calls/calls.routes.js';
import { getIO } from './realtime/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, '../public/static');

function corsOrigin(origin, callback) {
  // Same-origin, server-to-server, and curl requests have no Origin header.
  if (!origin) return callback(null, true);
  if (env.clientOrigins.includes(origin)) return callback(null, true);
  return callback(null, false);
}

function isSameOrigin(req, origin) {
  try {
    const parsed = new URL(origin);
    return parsed.host === req.get('host') && parsed.protocol === `${req.protocol}:`;
  } catch {
    return false;
  }
}

function trustedOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  // The client can be served by this same process in production (single-service mode),
  // so accept the request's own origin in addition to the configured frontend origins.
  if (origin && !env.clientOrigins.includes(origin) && !isSameOrigin(req, origin)) {
    return next(new AppError(403, 'UNTRUSTED_ORIGIN', 'This request came from an unknown origin.'));
  }
  return next();
}

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  fs.mkdirSync(env.uploadDir, { recursive: true });

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(cors({ origin: corsOrigin, credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/api/health' },
      customLogLevel: (_req, res, error) => {
        if (error || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'duoconnect-api',
      version: '1.0.0',
      database: dbMode(),
      realtime: Boolean(getIO()),
      push: pushEnabled,
      pushConfig: pushDiagnostics,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  app.use(
    '/uploads',
    express.static(env.uploadDir, {
      maxAge: '30d',
      immutable: true,
      fallthrough: true,
      index: false,
    }),
  );
  app.use(
    '/static',
    express.static(publicDir, {
      maxAge: env.isProduction ? '7d' : 0,
      fallthrough: true,
      index: false,
    }),
  );

  app.use('/api', globalLimiter);
  app.use('/api/auth', trustedOrigin, authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/friends', friendRoutes);
  app.use('/api/chats', chatRoutes);
  app.use('/api/messages', messageRoutes);
  app.use('/api/uploads', uploadRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/calls', callRoutes);

  app.use('/api', notFoundHandler);

  // Serve the built client when it is available (single-service production deploy).
  const clientDist = path.resolve(here, '../../client/dist');
  const clientIndex = path.join(clientDist, 'index.html');
  if (fs.existsSync(clientIndex)) {
    app.use(
      '/assets',
      express.static(path.join(clientDist, 'assets'), {
        maxAge: '1y',
        immutable: true,
        fallthrough: false,
      }),
    );
    app.use(
      express.static(clientDist, {
        maxAge: env.isProduction ? '1h' : 0,
        fallthrough: true,
        index: false,
      }),
    );
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (/^\/(api|uploads|static)(\/|$)/.test(req.path)) return next();
      return res.sendFile(clientIndex, { headers: { 'Cache-Control': 'no-cache' } });
    });
  }

  app.use(errorHandler);

  return app;
}
