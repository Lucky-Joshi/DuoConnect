import { query } from '../../db/index.js';

const MESSAGE_SELECT = `
  SELECT m.id, m.seq, m.chat_id, m.sender_id, m.type, m.body, m.reply_to_id,
         m.forwarded_from_id, m.metadata, m.client_id, m.edited_at, m.deleted_at, m.created_at,
         u.username AS sender_username,
         u.display_name AS sender_display_name,
         u.avatar_url AS sender_avatar_url,
         rp.id AS reply_id,
         rp.body AS reply_body,
         rp.type AS reply_type,
         rp.deleted_at AS reply_deleted_at,
         rp.sender_id AS reply_sender_id,
         ru.username AS reply_username,
         ru.display_name AS reply_display_name,
         ru.avatar_url AS reply_avatar_url
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    LEFT JOIN messages rp ON rp.id = m.reply_to_id
    LEFT JOIN users ru ON ru.id = rp.sender_id
`;

export async function listLatest(chatId, { cursor = null, limit = 40 }) {
  const { rows } = await query(
    `${MESSAGE_SELECT}
      WHERE m.chat_id = $1 AND ($2::bigint IS NULL OR m.seq < $2::bigint)
      ORDER BY m.seq DESC
      LIMIT $3`,
    [chatId, cursor, limit + 1],
  );
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    rows: page.reverse(),
    hasMore,
    oldestSeq: page.length ? Number(page[0].seq) : null,
  };
}

export async function listAround(chatId, seq, limit = 40) {
  const half = Math.max(5, Math.floor(limit / 2));
  const older = await query(
    `${MESSAGE_SELECT}
      WHERE m.chat_id = $1 AND m.seq <= $2
      ORDER BY m.seq DESC
      LIMIT $3`,
    [chatId, seq, half + 1],
  );
  const newer = await query(
    `${MESSAGE_SELECT}
      WHERE m.chat_id = $1 AND m.seq > $2
      ORDER BY m.seq ASC
      LIMIT $3`,
    [chatId, seq, half + 1],
  );
  const rows = [...older.rows.reverse(), ...newer.rows];
  return {
    rows,
    hasMoreOlder: older.rows.length > half,
    hasMoreNewer: newer.rows.length > half,
  };
}

export async function getMessageRow(messageId) {
  const { rows } = await query(`${MESSAGE_SELECT} WHERE m.id = $1 LIMIT 1`, [messageId]);
  return rows[0] ?? null;
}

export async function getMessageChatInfo(messageId) {
  const { rows } = await query(
    'SELECT id, chat_id, sender_id, seq, deleted_at FROM messages WHERE id = $1 LIMIT 1',
    [messageId],
  );
  return rows[0] ?? null;
}

const queryRunner = { query: (text, params) => query(text, params) };

/** Look up a message previously inserted with this client-generated key. */
export async function findMessageByClientId(senderId, clientId, client = queryRunner) {
  if (!clientId) return null;
  const { rows } = await client.query(
    'SELECT id FROM messages WHERE sender_id = $1 AND client_id = $2 LIMIT 1',
    [senderId, clientId],
  );
  return rows[0]?.id ?? null;
}

export async function insertMessage(client, fields) {
  const { rows } = await client.query(
    `INSERT INTO messages (chat_id, sender_id, type, body, reply_to_id, forwarded_from_id, metadata, client_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
     ON CONFLICT (sender_id, client_id) WHERE client_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [
      fields.chatId,
      fields.senderId,
      fields.type,
      fields.body,
      fields.replyToId ?? null,
      fields.forwardedFromId ?? null,
      JSON.stringify(fields.metadata ?? {}),
      fields.clientId ?? null,
    ],
  );
  // A null id means this clientId was already inserted by a previous attempt.
  return rows[0]?.id ?? null;
}

export async function insertReceipts(client, messageId, chatId, senderId) {
  await client.query(
    `INSERT INTO message_receipts (message_id, user_id, delivered_at)
     SELECT $1, cm.user_id,
            CASE WHEN COALESCE(p.socket_count, 0) > 0 THEN now() ELSE NULL END
       FROM chat_members cm
       LEFT JOIN presence p ON p.user_id = cm.user_id
      WHERE cm.chat_id = $2 AND cm.user_id <> $3`,
    [messageId, chatId, senderId],
  );
}

export async function getReceiptsForMessages(messageIds) {
  if (!messageIds.length) return new Map();
  const { rows } = await query(
    `SELECT r.message_id, r.user_id, r.delivered_at, r.read_at,
            COALESCE(s.read_receipts, true) AS read_receipts_enabled
       FROM message_receipts r
       LEFT JOIN user_settings s ON s.user_id = r.user_id
      WHERE r.message_id = ANY($1::uuid[])`,
    [messageIds],
  );
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.message_id)) grouped.set(row.message_id, []);
    grouped.get(row.message_id).push(row);
  }
  return grouped;
}

export async function getPinnedIdsForMessages(messageIds) {
  if (!messageIds.length) return new Set();
  const { rows } = await query(
    'SELECT message_id FROM pinned_messages WHERE message_id = ANY($1::uuid[])',
    [messageIds],
  );
  return new Set(rows.map((row) => row.message_id));
}

export async function getReactionsForMessages(messageIds) {
  if (!messageIds.length) return new Map();
  const { rows } = await query(
    `SELECT message_id, emoji, COALESCE(array_agg(user_id ORDER BY created_at), '{}'::uuid[]) AS user_ids
       FROM message_reactions
      WHERE message_id = ANY($1::uuid[])
      GROUP BY message_id, emoji
      ORDER BY message_id, emoji`,
    [messageIds],
  );
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.message_id)) grouped.set(row.message_id, []);
    grouped.get(row.message_id).push({
      emoji: row.emoji,
      count: row.user_ids.length,
      userIds: row.user_ids,
    });
  }
  return grouped;
}

/** Toggle one emoji reaction. Returns true when it was added, false when removed. */
export async function toggleReaction(messageId, userId, emoji, client = { query }) {
  const removed = await client.query(
    `DELETE FROM message_reactions
      WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
    [messageId, userId, emoji],
  );
  if (removed.rowCount) return false;

  await client.query(
    `INSERT INTO message_reactions (message_id, user_id, emoji)
     VALUES ($1, $2, $3)
     ON CONFLICT (message_id, user_id, emoji) DO NOTHING`,
    [messageId, userId, emoji],
  );
  return true;
}

export async function updateMessageBody(messageId, body) {
  const { rows } = await query(
    `UPDATE messages SET body = $2, edited_at = now()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *`,
    [messageId, body],
  );
  return rows[0] ?? null;
}

export async function softDeleteMessage(messageId) {
  const { rows } = await query(
    `UPDATE messages SET body = NULL, deleted_at = now(), metadata = '{}'::jsonb
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *`,
    [messageId],
  );
  return rows[0] ?? null;
}

export async function deleteAttachmentsForMessage(messageId) {
  const { rows } = await query(
    'DELETE FROM attachments WHERE message_id = $1 RETURNING url, public_id, provider',
    [messageId],
  );
  return rows;
}

export async function deletePinsForMessage(messageId) {
  await query('DELETE FROM pinned_messages WHERE message_id = $1', [messageId]);
}

export async function pinMessage(chatId, messageId, userId) {
  const { rows } = await query(
    `INSERT INTO pinned_messages (chat_id, message_id, pinned_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (chat_id, message_id) DO UPDATE SET pinned_by = EXCLUDED.pinned_by
     RETURNING *`,
    [chatId, messageId, userId],
  );
  return rows[0];
}

export async function unpinMessage(chatId, messageId) {
  const { rowCount } = await query(
    'DELETE FROM pinned_messages WHERE chat_id = $1 AND message_id = $2',
    [chatId, messageId],
  );
  return rowCount > 0;
}

export async function listPinned(chatId) {
  const { rows } = await query(
    `${MESSAGE_SELECT}
       JOIN pinned_messages pm ON pm.message_id = m.id
      WHERE pm.chat_id = $1 AND m.deleted_at IS NULL
      ORDER BY pm.created_at DESC
      LIMIT 50`,
    [chatId],
  );
  return rows;
}

export async function searchInChat(chatId, term, limit = 30) {
  const like = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
  const { rows } = await query(
    `${MESSAGE_SELECT}
      WHERE m.chat_id = $1
        AND m.deleted_at IS NULL
        AND (m.search_vector @@ plainto_tsquery('english', $2) OR m.body ILIKE $3)
      ORDER BY m.seq DESC
      LIMIT $4`,
    [chatId, term, like, limit],
  );
  return rows;
}

export async function searchAcrossChats(userId, term, limit = 40) {
  const like = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
  const { rows } = await query(
    `${MESSAGE_SELECT}
       JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = $1
      WHERE m.deleted_at IS NULL
        AND (m.search_vector @@ plainto_tsquery('english', $2) OR m.body ILIKE $3)
      ORDER BY m.seq DESC
      LIMIT $4`,
    [userId, term, like, limit],
  );
  return rows;
}

export async function markDelivered(userId) {
  const { rows } = await query(
    `UPDATE message_receipts r
        SET delivered_at = now()
       FROM messages m
      WHERE r.message_id = m.id
        AND r.user_id = $1
        AND r.delivered_at IS NULL
        AND m.sender_id <> $1
      RETURNING m.id AS message_id, m.sender_id, m.chat_id`,
    [userId],
  );
  return rows;
}

export async function markRead(chatId, userId, seq) {
  const { rows } = await query(
    `UPDATE message_receipts r
        SET read_at = now(), delivered_at = COALESCE(r.delivered_at, now())
       FROM messages m
      WHERE r.message_id = m.id
        AND m.chat_id = $1
        AND m.seq <= $2
        AND r.user_id = $3
        AND r.read_at IS NULL
        AND m.sender_id <> $3
      RETURNING m.id AS message_id, m.sender_id`,
    [chatId, seq, userId],
  );
  return rows;
}

export async function getSeqForMessage(chatId, messageId) {
  const { rows } = await query('SELECT seq FROM messages WHERE id = $1 AND chat_id = $2 LIMIT 1', [
    messageId,
    chatId,
  ]);
  return rows[0]?.seq ?? null;
}

export async function getLatestSeq(chatId) {
  const { rows } = await query('SELECT max(seq) AS seq FROM messages WHERE chat_id = $1', [chatId]);
  return rows[0]?.seq ?? 0;
}

export async function getChatMemberPresence(chatId) {
  const { rows } = await query(
    `SELECT cm.user_id, COALESCE(p.socket_count, 0)::int AS socket_count
       FROM chat_members cm
       LEFT JOIN presence p ON p.user_id = cm.user_id
      WHERE cm.chat_id = $1`,
    [chatId],
  );
  return rows;
}

export async function getRecentAttachmentsForCleanup() {
  const { rows } = await query(
    `SELECT id, url, public_id, provider FROM attachments
      WHERE message_id IS NULL AND created_at < now() - interval '48 hours'
      LIMIT 200`,
  );
  return rows;
}

export async function deleteAttachmentRows(ids) {
  if (!ids.length) return;
  await query('DELETE FROM attachments WHERE id = ANY($1::uuid[])', [ids]);
}
