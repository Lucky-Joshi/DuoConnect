import { query } from '../../db/index.js';

export async function insertNotification({
  userId,
  actorId = null,
  type,
  chatId = null,
  callId = null,
  payload = {},
}) {
  const { rows } = await query(
    `INSERT INTO notifications (user_id, actor_id, type, chat_id, call_id, payload)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING *`,
    [userId, actorId, type, chatId, callId, JSON.stringify(payload)],
  );
  return rows[0];
}

export async function findActor(actorId) {
  if (!actorId) return null;
  const { rows } = await query(
    'SELECT id, username, display_name, avatar_url FROM users WHERE id = $1 AND deleted_at IS NULL',
    [actorId],
  );
  return rows[0] ?? null;
}

export async function listNotifications(userId, { before = null, limit = 50 } = {}) {
  const { rows } = await query(
    `SELECT n.*,
            a.username AS actor_username,
            a.display_name AS actor_display_name,
            a.avatar_url AS actor_avatar_url
       FROM notifications n
       LEFT JOIN users a ON a.id = n.actor_id
      WHERE n.user_id = $1
        AND ($2::timestamptz IS NULL OR n.created_at < $2::timestamptz)
      ORDER BY n.created_at DESC
      LIMIT $3`,
    [userId, before, limit],
  );
  return rows;
}

export async function unreadCount(userId) {
  const { rows } = await query(
    'SELECT count(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL',
    [userId],
  );
  return rows[0]?.count ?? 0;
}

export async function markRead(userId, notificationId) {
  const { rows } = await query(
    `UPDATE notifications SET read_at = now()
      WHERE id = $1 AND user_id = $2 AND read_at IS NULL
      RETURNING id`,
    [notificationId, userId],
  );
  return rows[0] ?? null;
}

export async function markAllRead(userId) {
  const { rowCount } = await query(
    'UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL',
    [userId],
  );
  return rowCount;
}

export async function deleteNotification(userId, notificationId) {
  const { rowCount } = await query('DELETE FROM notifications WHERE id = $1 AND user_id = $2', [
    notificationId,
    userId,
  ]);
  return rowCount > 0;
}

export async function clearRead(userId) {
  const { rowCount } = await query(
    'DELETE FROM notifications WHERE user_id = $1 AND read_at IS NOT NULL',
    [userId],
  );
  return rowCount;
}

export async function deleteForChat(userId, chatId) {
  await query('DELETE FROM notifications WHERE user_id = $1 AND chat_id = $2', [userId, chatId]);
}

export async function getNotificationSettings(userId) {
  const { rows } = await query('SELECT * FROM user_settings WHERE user_id = $1', [userId]);
  return rows[0] ?? null;
}
