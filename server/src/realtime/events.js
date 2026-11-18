import { EventEmitter } from 'node:events';

/**
 * A tiny domain event bridge. Services emit facts; the socket layer decides how
 * to deliver them. This keeps HTTP/business code free of Socket.IO imports and
 * makes it trivial to swap in a Redis pub/sub adapter for horizontal scaling.
 */
export const realtime = new EventEmitter();
realtime.setMaxListeners(50);

export function emitToUser(userId, event, payload) {
  realtime.emit('user:event', { userId, event, payload });
}

export function emitToUsers(userIds, event, payload, { exclude = null } = {}) {
  for (const userId of new Set(userIds)) {
    if (userId === exclude) continue;
    emitToUser(userId, event, payload);
  }
}
