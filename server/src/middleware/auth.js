import { verifyAccessToken, extractBearerToken } from '../utils/token.js';
import { unauthorized } from '../utils/errors.js';
import { query } from '../db/index.js';

export async function requireAuth(req, res, next) {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) throw unauthorized('Authentication required.', 'AUTH_REQUIRED');

    const payload = verifyAccessToken(token);
    const { rows } = await query(
      'SELECT id, username, deleted_at FROM users WHERE id = $1 LIMIT 1',
      [payload.sub],
    );
    const user = rows[0];
    if (!user || user.deleted_at) {
      throw unauthorized('This account is no longer available.', 'ACCOUNT_UNAVAILABLE');
    }

    req.user = { id: user.id, username: user.username };
    next();
  } catch (error) {
    next(error);
  }
}

export async function socketAuth(socket, next) {
  try {
    const token =
      socket.handshake.auth?.token ||
      extractBearerToken(socket.handshake.headers?.authorization) ||
      null;
    if (!token) return next(new Error('AUTH_REQUIRED'));
    const payload = verifyAccessToken(token);

    const { rows } = await query(
      'SELECT id, username, display_name, deleted_at FROM users WHERE id = $1 LIMIT 1',
      [payload.sub],
    );
    const user = rows[0];
    if (!user || user.deleted_at) return next(new Error('ACCOUNT_UNAVAILABLE'));

    socket.data.userId = user.id;
    socket.data.username = user.username;
    socket.data.displayName = user.display_name;
    next();
  } catch (error) {
    next(new Error(error.code || 'INVALID_TOKEN'));
  }
}
