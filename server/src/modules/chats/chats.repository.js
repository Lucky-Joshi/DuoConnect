import { query, withTransaction } from '../../db/index.js';
import { directKey } from '../../utils/sanitize.js';

export async function ensureDirectChatTx(client, userA, userB) {
  const key = directKey(userA, userB);
  let { rows } = await client.query('SELECT * FROM chats WHERE dm_key = $1 LIMIT 1', [key]);
  let chat = rows[0];

  if (!chat) {
    const inserted = await client.query(
      `INSERT INTO chats (kind, dm_key, created_by)
       VALUES ('direct', $1, $2)
       ON CONFLICT (dm_key) DO NOTHING
       RETURNING *`,
      [key, userA],
    );
    chat = inserted.rows[0];
    if (!chat) {
      const existing = await client.query('SELECT * FROM chats WHERE dm_key = $1 LIMIT 1', [key]);
      chat = existing.rows[0];
    }
  }

  await client.query(
    `INSERT INTO chat_members (chat_id, user_id, role)
     VALUES ($1, $2, 'member'), ($1, $3, 'member')
     ON CONFLICT (chat_id, user_id) DO NOTHING`,
    [chat.id, userA, userB],
  );

  return chat;
}

export async function ensureDirectChat(userA, userB) {
  return withTransaction((tx) => ensureDirectChatTx(tx, userA, userB));
}

export async function getChatById(chatId) {
  const { rows } = await query('SELECT * FROM chats WHERE id = $1 LIMIT 1', [chatId]);
  return rows[0] ?? null;
}

export async function getMembership(chatId, userId) {
  const { rows } = await query(
    'SELECT * FROM chat_members WHERE chat_id = $1 AND user_id = $2 LIMIT 1',
    [chatId, userId],
  );
  return rows[0] ?? null;
}

export async function getMemberIds(chatId) {
  const { rows } = await query('SELECT user_id FROM chat_members WHERE chat_id = $1', [chatId]);
  return rows.map((row) => row.user_id);
}

export async function getListRows(userId) {
  const { rows } = await query(
    `SELECT c.id, c.kind, c.name, c.avatar_url, c.created_by, c.last_message_at,
            c.created_at, c.updated_at,
            cm.is_pinned, cm.is_muted, cm.last_read_seq, cm.role,
            lm.id AS lm_id, lm.seq AS lm_seq, lm.body AS lm_body, lm.type AS lm_type,
            lm.deleted_at AS lm_deleted_at, lm.created_at AS lm_created_at,
            lm.sender_id AS lm_sender_id, lu.display_name AS lm_sender_name,
            COALESCE(unread.count, 0)::int AS unread
       FROM chat_members cm
       JOIN chats c ON c.id = cm.chat_id
       LEFT JOIN LATERAL (
         SELECT id, seq, body, type, deleted_at, created_at, sender_id
           FROM messages
          WHERE chat_id = c.id
          ORDER BY seq DESC
          LIMIT 1
       ) lm ON true
       LEFT JOIN users lu ON lu.id = lm.sender_id
       LEFT JOIN LATERAL (
         SELECT count(*) AS count
           FROM message_receipts r
           JOIN messages m ON m.id = r.message_id
          WHERE r.user_id = $1
            AND m.chat_id = c.id
            AND r.read_at IS NULL
            AND m.sender_id <> $1
            AND m.deleted_at IS NULL
       ) unread ON true
      WHERE cm.user_id = $1 AND cm.is_archived = false
      ORDER BY cm.is_pinned DESC, c.last_message_at DESC`,
    [userId],
  );
  return rows;
}

export async function getPeersForChats(chatIds, viewerId) {
  if (!chatIds.length) return [];
  const { rows } = await query(
    `SELECT cm.chat_id, u.id, u.username, u.display_name, u.avatar_url, u.about,
            u.status, u.last_seen_at, u.created_at, u.deleted_at,
            s.presence_visibility, s.last_seen_visibility,
            (f.id IS NOT NULL) AS is_friend,
            (b1.blocker_id IS NOT NULL) AS blocked_by_me,
            (b2.blocker_id IS NOT NULL) AS blocked_me
       FROM chat_members cm
       JOIN users u ON u.id = cm.user_id
       LEFT JOIN user_settings s ON s.user_id = u.id
       LEFT JOIN friendships f
         ON f.user_low = least($2::uuid, u.id) AND f.user_high = greatest($2::uuid, u.id)
       LEFT JOIN blocks b1 ON b1.blocker_id = $2 AND b1.blocked_id = u.id
       LEFT JOIN blocks b2 ON b2.blocker_id = u.id AND b2.blocked_id = $2
      WHERE cm.chat_id = ANY($1::uuid[]) AND cm.user_id <> $2`,
    [chatIds, viewerId],
  );
  return rows;
}

export async function getChatWithMembers(chatId, viewerId) {
  const chat = await getChatById(chatId);
  if (!chat) return null;
  const { rows: members } = await query(
    `SELECT cm.role, cm.joined_at, cm.is_pinned, cm.is_muted, cm.last_read_seq,
            u.id, u.username, u.display_name, u.avatar_url, u.about, u.status,
            u.last_seen_at, u.created_at, u.deleted_at,
            s.presence_visibility, s.last_seen_visibility,
            (f.id IS NOT NULL) AS is_friend,
            (b1.blocker_id IS NOT NULL) AS blocked_by_me,
            (b2.blocker_id IS NOT NULL) AS blocked_me
       FROM chat_members cm
       JOIN users u ON u.id = cm.user_id
       LEFT JOIN user_settings s ON s.user_id = u.id
       LEFT JOIN friendships f
         ON f.user_low = least($2::uuid, u.id) AND f.user_high = greatest($2::uuid, u.id)
       LEFT JOIN blocks b1 ON b1.blocker_id = $2 AND b1.blocked_id = u.id
       LEFT JOIN blocks b2 ON b2.blocker_id = u.id AND b2.blocked_id = $2
      WHERE cm.chat_id = $1
      ORDER BY cm.role = 'owner' DESC, u.display_name ASC`,
    [chatId, viewerId],
  );
  return { chat, members };
}

export async function setLastMessageAt(chatId) {
  await query('UPDATE chats SET last_message_at = now(), updated_at = now() WHERE id = $1', [
    chatId,
  ]);
}

export async function setPinned(chatId, userId, pinned) {
  await query(`UPDATE chat_members SET is_pinned = $3 WHERE chat_id = $1 AND user_id = $2`, [
    chatId,
    userId,
    pinned,
  ]);
}

export async function setMuted(chatId, userId, muted) {
  await query(`UPDATE chat_members SET is_muted = $3 WHERE chat_id = $1 AND user_id = $2`, [
    chatId,
    userId,
    muted,
  ]);
}

export async function setLastReadSeq(chatId, userId, seq) {
  await query(
    `UPDATE chat_members
        SET last_read_seq = greatest(last_read_seq, $3)
      WHERE chat_id = $1 AND user_id = $2`,
    [chatId, userId, seq],
  );
}

export async function getAccessState(chatId, userId) {
  const membership = await getMembership(chatId, userId);
  if (!membership) return null;

  const chat = await getChatById(chatId);
  if (!chat) return null;
  if (chat.kind !== 'direct') {
    return { membership, chat, peer: null, canMessage: true, reason: null };
  }

  const { rows } = await query(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, u.status, u.last_seen_at,
            s.presence_visibility, s.last_seen_visibility,
            (f.id IS NOT NULL) AS is_friend,
            (b1.blocker_id IS NOT NULL) AS blocked_by_me,
            (b2.blocker_id IS NOT NULL) AS blocked_me
       FROM chat_members cm
       JOIN users u ON u.id = cm.user_id
       LEFT JOIN user_settings s ON s.user_id = u.id
       LEFT JOIN friendships f
         ON f.user_low = least($2::uuid, u.id) AND f.user_high = greatest($2::uuid, u.id)
       LEFT JOIN blocks b1 ON b1.blocker_id = $2 AND b1.blocked_id = u.id
       LEFT JOIN blocks b2 ON b2.blocker_id = u.id AND b2.blocked_id = $2
      WHERE cm.chat_id = $1 AND cm.user_id <> $2
      LIMIT 1`,
    [chatId, userId],
  );
  const peer = rows[0] ?? null;
  if (!peer) return { membership, chat, peer: null, canMessage: false, reason: 'peer_missing' };
  if (peer.blocked_by_me)
    return { membership, chat, peer, canMessage: false, reason: 'blocked_by_me' };
  if (peer.blocked_me) return { membership, chat, peer, canMessage: false, reason: 'blocked_me' };
  if (!peer.is_friend) return { membership, chat, peer, canMessage: false, reason: 'not_friends' };
  return { membership, chat, peer, canMessage: true, reason: null };
}
