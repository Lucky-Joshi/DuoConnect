import { query } from '../../db/index.js';

const MAX_SUBSCRIPTIONS_PER_USER = 10;

export async function listByUser(userId) {
  const { rows } = await query(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1 ORDER BY updated_at DESC',
    [userId],
  );
  return rows;
}

export async function upsert({ userId, endpoint, p256dh, auth }) {
  const { rows } = await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (endpoint) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth,
           updated_at = now()
     WHERE push_subscriptions.user_id = EXCLUDED.user_id
     RETURNING id, endpoint`,
    [userId, endpoint, p256dh, auth],
  );
  if (!rows[0]) return null;

  await query(
    `DELETE FROM push_subscriptions
      WHERE user_id = $1
        AND id NOT IN (
          SELECT id FROM push_subscriptions WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2
        )`,
    [userId, MAX_SUBSCRIPTIONS_PER_USER],
  );
  return rows[0];
}

export async function remove(userId, endpoint) {
  const { rowCount } = await query(
    'DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
    [userId, endpoint],
  );
  return rowCount > 0;
}

export async function removeById(id) {
  await query('DELETE FROM push_subscriptions WHERE id = $1', [id]);
}
