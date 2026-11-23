import { query } from '../../db/index.js';

const GAME_SELECT = `
  SELECT g.*,
         i.username AS inviter_username, i.display_name AS inviter_display_name, i.avatar_url AS inviter_avatar_url,
         e.username AS invitee_username, e.display_name AS invitee_display_name, e.avatar_url AS invitee_avatar_url,
         w.username AS winner_username, w.display_name AS winner_display_name, w.avatar_url AS winner_avatar_url
    FROM game_sessions g
    JOIN users i ON i.id = g.inviter_id
    JOIN users e ON e.id = g.invitee_id
    LEFT JOIN users w ON w.id = g.winner_id
`;

export async function createGame(client, fields) {
  const { rows } = await client.query(
    `INSERT INTO game_sessions
      (chat_id, type, status, inviter_id, invitee_id, state, invite_message_id)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
     RETURNING id`,
    [
      fields.chatId,
      fields.type,
      fields.status ?? 'invited',
      fields.inviterId,
      fields.inviteeId,
      JSON.stringify(fields.state ?? {}),
      fields.inviteMessageId ?? null,
    ],
  );
  return rows[0].id;
}

export async function attachInviteMessage(client, gameId, messageId) {
  await client.query(
    'UPDATE game_sessions SET invite_message_id = $2, updated_at = now() WHERE id = $1',
    [gameId, messageId],
  );
}

export async function getGameById(gameId) {
  const { rows } = await query(`${GAME_SELECT} WHERE g.id = $1 LIMIT 1`, [gameId]);
  return rows[0] ?? null;
}

export async function getGameByIdForUpdate(client, gameId) {
  const { rows } = await client.query(
    `${GAME_SELECT.replace('FROM game_sessions g', 'FROM game_sessions g')}
     WHERE g.id = $1
     FOR UPDATE OF g`,
    [gameId],
  );
  return rows[0] ?? null;
}

export async function updateGame(client, gameId, fields) {
  const sets = ['updated_at = now()'];
  const values = [gameId];
  let i = 2;
  if ('status' in fields) {
    sets.push(`status = $${i++}`);
    values.push(fields.status);
  }
  if ('winnerId' in fields) {
    sets.push(`winner_id = $${i++}`);
    values.push(fields.winnerId);
  }
  if ('result' in fields) {
    sets.push(`result = $${i++}`);
    values.push(fields.result);
  }
  if ('state' in fields) {
    sets.push(`state = $${i++}::jsonb`);
    values.push(JSON.stringify(fields.state));
  }
  if ('startedAt' in fields) {
    sets.push(`started_at = COALESCE(started_at, $${i++})`);
    values.push(fields.startedAt);
  }
  if ('endedAt' in fields) {
    sets.push(`ended_at = $${i++}`);
    values.push(fields.endedAt);
  }
  if ('inviteMessageId' in fields) {
    sets.push(`invite_message_id = $${i++}`);
    values.push(fields.inviteMessageId);
  }

  const { rows } = await client.query(
    `UPDATE game_sessions SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
    values,
  );
  return rows[0] ?? null;
}

export async function getActiveForChat(chatId) {
  const { rows } = await query(
    `${GAME_SELECT}
      WHERE g.chat_id = $1 AND g.status IN ('invited', 'active')
      ORDER BY g.updated_at DESC
      LIMIT 1`,
    [chatId],
  );
  return rows[0] ?? null;
}

export async function getLatestForChat(chatId, limit = 20) {
  const { rows } = await query(
    `${GAME_SELECT}
      WHERE g.chat_id = $1
      ORDER BY g.created_at DESC
      LIMIT $2`,
    [chatId, limit],
  );
  return rows;
}

export async function insertEvent(client, { gameId, userId = null, type, payload = {} }) {
  await client.query(
    `INSERT INTO game_events (game_id, user_id, type, payload)
     VALUES ($1,$2,$3,$4::jsonb)`,
    [gameId, userId, type, JSON.stringify(payload)],
  );
}

export async function getStats(userId, peerId) {
  const { rows } = await query(
    `SELECT
       type,
       COUNT(*) FILTER (WHERE status = 'completed' AND winner_id = $1)::int AS wins,
       COUNT(*) FILTER (WHERE status = 'completed' AND winner_id = $2)::int AS losses,
       COUNT(*) FILTER (WHERE status = 'completed' AND result = 'draw')::int AS draws,
       COUNT(*) FILTER (WHERE status = 'completed')::int AS completed
     FROM game_sessions
     WHERE ((inviter_id = $1 AND invitee_id = $2) OR (inviter_id = $2 AND invitee_id = $1))
     GROUP BY type`,
    [userId, peerId],
  );
  return rows;
}
