import { query } from '../db/index.js';
import { emitToUser } from './events.js';
import { getFriendIds } from '../modules/friends/friends.repository.js';

/**
 * Presence is tracked in-process for low-latency routing and mirrored into
 * Postgres for durability and for services (delivery receipts) that don't live
 * in this process. Swap the map for a Redis store when scaling horizontally.
 */
const connections = new Map();

const DEFAULT_SETTINGS = { presence_visibility: 'friends', last_seen_visibility: 'friends' };

async function getPresenceSettings(userId) {
  const { rows } = await query(
    'SELECT presence_visibility, last_seen_visibility FROM user_settings WHERE user_id = $1',
    [userId],
  );
  return rows[0] ?? DEFAULT_SETTINGS;
}

function isFriend(recipientId, friendIds) {
  return friendIds.includes(recipientId);
}

function lastSeenVisible(visibility, recipientId, friendIds) {
  if (visibility === 'everyone') return true;
  if (visibility === 'nobody') return false;
  return isFriend(recipientId, friendIds);
}

async function broadcastPresence(userId, { status, lastSeenAt }) {
  const settings = await getPresenceSettings(userId);
  const friendIds = await getFriendIds(userId);

  let recipients;
  if (settings.presence_visibility === 'everyone') {
    recipients = [...connections.keys()];
  } else if (settings.presence_visibility === 'nobody') {
    recipients = friendIds;
  } else {
    recipients = friendIds;
  }

  const visibleStatus = settings.presence_visibility === 'nobody' ? 'offline' : status;

  for (const recipientId of new Set(recipients)) {
    if (recipientId === userId) continue;
    emitToUser(recipientId, 'presence:update', {
      userId,
      status: visibleStatus,
      lastSeenAt: lastSeenVisible(settings.last_seen_visibility, recipientId, friendIds)
        ? lastSeenAt
        : null,
    });
  }
}

export async function addConnection(userId, socketId) {
  let set = connections.get(userId);
  if (!set) {
    set = new Set();
    connections.set(userId, set);
  }
  set.add(socketId);
  const first = set.size === 1;

  await query(
    `INSERT INTO presence (user_id, status, socket_count, last_active_at)
     VALUES ($1, 'online', $2, now())
     ON CONFLICT (user_id) DO UPDATE
       SET status = 'online', socket_count = $2, last_active_at = now(), updated_at = now()`,
    [userId, set.size],
  );
  await query('UPDATE users SET status = $2, updated_at = now() WHERE id = $1', [userId, 'online']);

  if (first) {
    await broadcastPresence(userId, { status: 'online', lastSeenAt: null });
  }
  return first;
}

export async function removeConnection(userId, socketId) {
  const set = connections.get(userId);
  if (!set) return true;
  set.delete(socketId);
  if (set.size > 0) {
    await query(`UPDATE presence SET socket_count = $2, updated_at = now() WHERE user_id = $1`, [
      userId,
      set.size,
    ]);
    return false;
  }

  connections.delete(userId);
  const { rows } = await query(
    `UPDATE users SET status = 'offline', last_seen_at = now(), updated_at = now()
      WHERE id = $1 RETURNING last_seen_at`,
    [userId],
  );
  await query(
    `UPDATE presence SET status = 'offline', socket_count = 0, last_active_at = now(), updated_at = now()
      WHERE user_id = $1`,
    [userId],
  );
  await broadcastPresence(userId, {
    status: 'offline',
    lastSeenAt: rows[0]?.last_seen_at ?? new Date(),
  });
  return true;
}

export async function setUserStatus(userId, status) {
  if (!['online', 'away'].includes(status)) return;
  if (!connections.has(userId)) return;

  await query(
    `UPDATE presence SET status = $2, last_active_at = now(), updated_at = now() WHERE user_id = $1`,
    [userId, status],
  );
  await query('UPDATE users SET status = $2, updated_at = now() WHERE id = $1', [userId, status]);
  await broadcastPresence(userId, { status, lastSeenAt: null });
}

export async function touchPresence(userId) {
  await query('UPDATE presence SET last_active_at = now() WHERE user_id = $1', [userId]);
}

export function activeUserIds() {
  return [...connections.keys()];
}

export async function getFriendPresence(userId) {
  const { rows } = await query(
    `SELECT u.id, u.status, u.last_seen_at,
            s.presence_visibility, s.last_seen_visibility
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.user_low = $1 THEN f.user_high ELSE f.user_low END
       LEFT JOIN user_settings s ON s.user_id = u.id
      WHERE (f.user_low = $1 OR f.user_high = $1) AND u.deleted_at IS NULL`,
    [userId],
  );

  return rows.map((row) => {
    const presence = row.presence_visibility ?? 'friends';
    const lastSeen = row.last_seen_visibility ?? 'friends';
    return {
      userId: row.id,
      status: presence === 'nobody' ? 'offline' : row.status,
      lastSeenAt:
        lastSeen === 'nobody' || (presence === 'nobody' && lastSeen === 'friends')
          ? null
          : row.last_seen_at,
    };
  });
}

export async function resetPresenceOnBoot() {
  await query(`UPDATE presence SET socket_count = 0, status = 'offline', updated_at = now()`);
  await query(`UPDATE users SET status = 'offline' WHERE status <> 'offline'`);
}

export function connectionCount(userId) {
  return connections.get(userId)?.size ?? 0;
}
