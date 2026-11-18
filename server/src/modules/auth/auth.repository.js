import { query, withTransaction } from '../../db/index.js';

const USER_SELECT = `
  u.id, u.email, u.username, u.display_name, u.password_hash, u.avatar_url, u.about,
  u.status, u.last_seen_at, u.created_at, u.deleted_at,
  s.theme, s.accent, s.wallpaper, s.message_notifications, s.friend_request_notifications,
  s.call_notifications, s.sound_enabled, s.desktop_notifications, s.read_receipts,
  s.presence_visibility, s.last_seen_visibility
`;

const run = (client, text, params) => (client ? client.query(text, params) : query(text, params));

export async function findUserByIdentifier(identifier) {
  const { rows } = await query(
    `SELECT ${USER_SELECT}
       FROM users u
       LEFT JOIN user_settings s ON s.user_id = u.id
      WHERE (lower(u.email) = lower($1) OR lower(u.username) = lower($1))
        AND u.deleted_at IS NULL
      LIMIT 1`,
    [identifier],
  );
  return rows[0] ?? null;
}

export async function findUserById(id) {
  const { rows } = await query(
    `SELECT ${USER_SELECT}
       FROM users u
       LEFT JOIN user_settings s ON s.user_id = u.id
      WHERE u.id = $1 AND u.deleted_at IS NULL
      LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function findUserByIdTx(client, id) {
  const { rows } = await run(
    client,
    `SELECT ${USER_SELECT}
       FROM users u
       LEFT JOIN user_settings s ON s.user_id = u.id
      WHERE u.id = $1 AND u.deleted_at IS NULL
      LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function emailOrUsernameTaken(email, username) {
  const { rows } = await query(
    `SELECT lower(email) = lower($1) AS email_taken, lower(username) = lower($2) AS username_taken
       FROM users
      WHERE lower(email) = lower($1) OR lower(username) = lower($2)
      LIMIT 2`,
    [email, username],
  );
  return {
    email: rows.some((row) => row.email_taken),
    username: rows.some((row) => row.username_taken),
  };
}

export async function createUser({ email, username, displayName, passwordHash }) {
  return withTransaction(async (tx) => {
    const { rows } = await tx.query(
      `INSERT INTO users (email, username, display_name, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [email, username, displayName, passwordHash],
    );
    const id = rows[0].id;

    await tx.query('INSERT INTO user_settings (user_id) VALUES ($1)', [id]);
    await tx.query('INSERT INTO presence (user_id) VALUES ($1)', [id]);
    await tx.query(
      `INSERT INTO notifications (user_id, type, payload)
       VALUES ($1, 'system', $2::jsonb)`,
      [
        id,
        JSON.stringify({
          title: 'Welcome to DuoConnect',
          body: 'Find someone you care about and start a conversation.',
        }),
      ],
    );

    return id;
  });
}

export async function insertRefreshToken(client, payload) {
  await (client ?? { query }).query(
    `INSERT INTO refresh_tokens
      (id, user_id, token_hash, family_id, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      payload.id,
      payload.userId,
      payload.tokenHash,
      payload.familyId,
      payload.expiresAt,
      payload.userAgent ?? null,
      payload.ip ?? null,
    ],
  );
}

export async function findRefreshToken(hash) {
  const { rows } = await query(
    `SELECT rt.*, u.id AS account_id, u.username, u.deleted_at
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
      WHERE rt.token_hash = $1
      LIMIT 1`,
    [hash],
  );
  return rows[0] ?? null;
}

export async function rotateRefreshToken({ oldToken, newToken }) {
  return withTransaction(async (tx) => {
    const revoked = await tx.query(
      `UPDATE refresh_tokens
          SET revoked_at = now(), last_used_at = now()
        WHERE id = $1 AND revoked_at IS NULL
        RETURNING id, family_id, user_id`,
      [oldToken.id],
    );
    if (revoked.rowCount === 0) return null;

    await tx.query('UPDATE refresh_tokens SET replaced_by = $2 WHERE id = $1', [
      oldToken.id,
      newToken.id,
    ]);
    await tx.query(
      `INSERT INTO refresh_tokens
        (id, user_id, token_hash, family_id, expires_at, user_agent, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        newToken.id,
        oldToken.user_id,
        newToken.tokenHash,
        oldToken.family_id,
        newToken.expiresAt,
        newToken.userAgent ?? null,
        newToken.ip ?? null,
      ],
    );
    return oldToken.family_id;
  });
}

export async function revokeRefreshToken(hash) {
  await query(
    `UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`,
    [hash],
  );
}

export async function revokeFamily(familyId) {
  await query(
    `UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL`,
    [familyId],
  );
}

export async function revokeAllSessions(userId, exceptHash = null) {
  await query(
    `UPDATE refresh_tokens
        SET revoked_at = now()
      WHERE user_id = $1
        AND revoked_at IS NULL
        AND ($2::text IS NULL OR token_hash <> $2)`,
    [userId, exceptHash],
  );
}

export async function listSessions(userId) {
  const { rows } = await query(
    `SELECT id, token_hash, user_agent, ip, expires_at, last_used_at, created_at
       FROM refresh_tokens
      WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
      ORDER BY created_at DESC`,
    [userId],
  );
  return rows;
}

export async function revokeSession(userId, sessionId) {
  const { rowCount } = await query(
    `UPDATE refresh_tokens SET revoked_at = now()
      WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
    [sessionId, userId],
  );
  return rowCount > 0;
}

export async function updatePassword(userId, passwordHash) {
  await query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [
    userId,
    passwordHash,
  ]);
}

export async function softDeleteAccount(userId) {
  const tag = userId.slice(0, 8);
  await withTransaction(async (tx) => {
    await tx.query(
      `UPDATE users
          SET email = $2,
              username = $3,
              display_name = 'Deleted user',
              password_hash = $4,
              avatar_url = NULL,
              about = '',
              status = 'offline',
              deleted_at = now(),
              updated_at = now()
        WHERE id = $1`,
      [userId, `deleted+${tag}@duoconnect.local`, `deleted_${tag}`, `deleted-${tag}-${Date.now()}`],
    );
    await tx.query('DELETE FROM friendships WHERE user_low = $1 OR user_high = $1', [userId]);
    await tx.query('DELETE FROM friend_requests WHERE sender_id = $1 OR receiver_id = $1', [
      userId,
    ]);
    await tx.query('DELETE FROM blocks WHERE blocker_id = $1 OR blocked_id = $1', [userId]);
    await tx.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
    await tx.query('DELETE FROM presence WHERE user_id = $1', [userId]);
    await tx.query('DELETE FROM notifications WHERE user_id = $1', [userId]);
  });
}

export async function updateLastSeen(userId) {
  await query('UPDATE users SET last_seen_at = now() WHERE id = $1', [userId]);
}
