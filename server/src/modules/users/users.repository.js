import { query } from '../../db/index.js';

const PUBLIC_SELECT = `
  u.id, u.username, u.display_name, u.avatar_url, u.about, u.status, u.last_seen_at,
  u.created_at, s.presence_visibility, s.last_seen_visibility
`;

const run = (client, text, params) => (client ? client.query(text, params) : query(text, params));

export async function getSettings(userId) {
  const { rows } = await query('SELECT * FROM user_settings WHERE user_id = $1', [userId]);
  return rows[0] ?? null;
}

export async function updateSettings(userId, fields) {
  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return getSettings(userId);

  const assignments = entries.map(([column], index) => `${column} = $${index + 2}`);
  const values = entries.map(([, value]) => value);

  const { rows } = await query(
    `UPDATE user_settings
        SET ${assignments.join(', ')}, updated_at = now()
      WHERE user_id = $1
      RETURNING *`,
    [userId, ...values],
  );
  return rows[0] ?? null;
}

export async function updateProfile(userId, fields) {
  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    const { rows } = await query('SELECT * FROM users WHERE id = $1', [userId]);
    return rows[0] ?? null;
  }
  const assignments = entries.map(([column], index) => `${column} = $${index + 2}`);
  const values = entries.map(([, value]) => value);
  const { rows } = await query(
    `UPDATE users SET ${assignments.join(', ')}, updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *`,
    [userId, ...values],
  );
  return rows[0] ?? null;
}

export async function getProfileByUsername(username, viewerId) {
  const { rows } = await query(
    `SELECT ${PUBLIC_SELECT},
            f.created_at AS friends_since,
            fr.id AS request_id,
            fr.sender_id AS request_sender,
            b1.blocker_id AS blocked_by_me,
            b2.blocker_id AS blocked_me
       FROM users u
       LEFT JOIN user_settings s ON s.user_id = u.id
       LEFT JOIN friendships f
         ON f.user_low = least($2::uuid, u.id) AND f.user_high = greatest($2::uuid, u.id)
       LEFT JOIN friend_requests fr
         ON fr.status = 'pending'
        AND ((fr.sender_id = $2 AND fr.receiver_id = u.id) OR (fr.sender_id = u.id AND fr.receiver_id = $2))
       LEFT JOIN blocks b1 ON b1.blocker_id = $2 AND b1.blocked_id = u.id
       LEFT JOIN blocks b2 ON b2.blocker_id = u.id AND b2.blocked_id = $2
      WHERE lower(u.username) = lower($1) AND u.deleted_at IS NULL
      LIMIT 1`,
    [username, viewerId],
  );
  return rows[0] ?? null;
}

export async function searchUsers({ q, viewerId, limit }) {
  const term = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
  const { rows } = await query(
    `SELECT ${PUBLIC_SELECT},
            (f.id IS NOT NULL) AS is_friend,
            fr.id AS request_id,
            fr.sender_id AS request_sender
       FROM users u
       LEFT JOIN user_settings s ON s.user_id = u.id
       LEFT JOIN friendships f
         ON f.user_low = least($1::uuid, u.id) AND f.user_high = greatest($1::uuid, u.id)
       LEFT JOIN friend_requests fr
         ON fr.status = 'pending'
        AND ((fr.sender_id = $1 AND fr.receiver_id = u.id) OR (fr.sender_id = u.id AND fr.receiver_id = $1))
       LEFT JOIN blocks b1 ON b1.blocker_id = $1 AND b1.blocked_id = u.id
       LEFT JOIN blocks b2 ON b2.blocker_id = u.id AND b2.blocked_id = $1
      WHERE u.deleted_at IS NULL
        AND u.id <> $1
        AND b1.blocker_id IS NULL
        AND b2.blocker_id IS NULL
        AND ($2 = '%%' OR u.username ILIKE $2 OR u.display_name ILIKE $2)
      ORDER BY (f.id IS NOT NULL) DESC, u.status <> 'offline' DESC, u.last_seen_at DESC
      LIMIT $3`,
    [viewerId, term, limit],
  );
  return rows;
}

export async function getUsersByIds(ids, viewerId) {
  if (ids.length === 0) return [];
  const { rows } = await query(
    `SELECT ${PUBLIC_SELECT},
            (f.id IS NOT NULL) AS is_friend
       FROM users u
       LEFT JOIN user_settings s ON s.user_id = u.id
       LEFT JOIN friendships f
         ON f.user_low = least($2::uuid, u.id) AND f.user_high = greatest($2::uuid, u.id)
      WHERE u.id = ANY($1::uuid[]) AND u.deleted_at IS NULL`,
    [ids, viewerId],
  );
  return rows;
}

export async function getFriendship(userId, otherId) {
  const { rows } = await query(
    `SELECT * FROM friendships
      WHERE user_low = least($1::uuid, $2::uuid) AND user_high = greatest($1::uuid, $2::uuid)
      LIMIT 1`,
    [userId, otherId],
  );
  return rows[0] ?? null;
}

export async function getSettingsMany(userIds) {
  if (userIds.length === 0) return [];
  const { rows } = await run(null, 'SELECT * FROM user_settings WHERE user_id = ANY($1::uuid[])', [
    userIds,
  ]);
  return rows;
}
