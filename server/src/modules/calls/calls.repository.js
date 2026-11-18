import { query } from '../../db/index.js';
import { mapCall } from '../../utils/serialize.js';

const CALL_SELECT = `
  SELECT c.*,
         cu.username AS caller_username, cu.display_name AS caller_display_name,
         cu.avatar_url AS caller_avatar_url,
         eu.username AS callee_username, eu.display_name AS callee_display_name,
         eu.avatar_url AS callee_avatar_url
    FROM calls c
    JOIN users cu ON cu.id = c.caller_id
    JOIN users eu ON eu.id = c.callee_id
`;

export async function createCall({ chatId, callerId, calleeId, kind }) {
  const { rows } = await query(
    `INSERT INTO calls (chat_id, caller_id, callee_id, kind, status)
     VALUES ($1, $2, $3, $4, 'ringing')
     RETURNING id`,
    [chatId, callerId, calleeId, kind],
  );
  return rows[0].id;
}

export async function getCallById(callId) {
  const { rows } = await query(`${CALL_SELECT} WHERE c.id = $1 LIMIT 1`, [callId]);
  return rows[0] ? mapCall(rows[0]) : null;
}

export async function getCallRow(callId) {
  const { rows } = await query('SELECT * FROM calls WHERE id = $1 LIMIT 1', [callId]);
  return rows[0] ?? null;
}

export async function findActiveBetween(userA, userB) {
  const { rows } = await query(
    `${CALL_SELECT}
      WHERE c.status IN ('ringing', 'ongoing')
        AND ((c.caller_id = $1 AND c.callee_id = $2) OR (c.caller_id = $2 AND c.callee_id = $1))
      ORDER BY c.created_at DESC
      LIMIT 1`,
    [userA, userB],
  );
  return rows[0] ?? null;
}

export async function findActiveForUser(userId) {
  const { rows } = await query(
    "SELECT * FROM calls WHERE (caller_id = $1 OR callee_id = $1) AND status IN ('ringing', 'ongoing')",
    [userId],
  );
  return rows;
}

export async function updateCall(callId, fields) {
  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
  if (!entries.length) return getCallById(callId);
  const assignments = entries.map(([column], index) => `${column} = $${index + 2}`);
  const values = entries.map(([, value]) => value);
  await query(`UPDATE calls SET ${assignments.join(', ')} WHERE id = $1`, [callId, ...values]);
  return getCallById(callId);
}

export async function transitionCall(callId, fromStatuses, fields) {
  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
  if (!entries.length) return getCallById(callId);
  const assignments = entries.map(([column], index) => `${column} = $${index + 2}`);
  const values = entries.map(([, value]) => value);
  const placeholders = fromStatuses.map((_, index) => `$${index + 2 + values.length}`).join(', ');
  const { rows } = await query(
    `UPDATE calls SET ${assignments.join(', ')}
      WHERE id = $1 AND status IN (${placeholders})
      RETURNING id`,
    [callId, ...values, ...fromStatuses],
  );
  if (!rows[0]) return null;
  return getCallById(callId);
}

export async function listCallHistory(userId, limit = 50) {
  const { rows } = await query(
    `${CALL_SELECT}
      WHERE c.caller_id = $1 OR c.callee_id = $1
      ORDER BY c.created_at DESC
      LIMIT $2`,
    [userId, limit],
  );
  return rows;
}

export async function markStaleRinging() {
  const { rows } = await query(
    `UPDATE calls
        SET status = 'missed', ended_at = now(), end_reason = 'timeout'
      WHERE status = 'ringing' AND started_at < now() - interval '3 minutes'
      RETURNING id`,
  );
  return rows.map((row) => row.id);
}
