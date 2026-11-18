import { query } from '../../db/index.js';
import { badRequest } from '../../utils/errors.js';
import { mapAttachment } from '../../utils/serialize.js';

export async function createAttachment({
  uploaderId,
  url,
  publicId,
  name,
  mimeType,
  sizeBytes,
  width = null,
  height = null,
  durationMs = null,
  provider,
}) {
  const { rows } = await query(
    `INSERT INTO attachments
      (uploader_id, url, public_id, name, mime_type, size_bytes, width, height, duration_ms, provider)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [uploaderId, url, publicId, name, mimeType, sizeBytes, width, height, durationMs, provider],
  );
  return mapAttachment(rows[0]);
}

export async function getUnclaimedAttachments(ids, uploaderId) {
  if (!ids.length) return [];
  const { rows } = await query(
    `SELECT * FROM attachments
      WHERE id = ANY($1::uuid[]) AND uploader_id = $2 AND message_id IS NULL`,
    [ids, uploaderId],
  );
  return rows;
}

export async function claimAttachments(client, ids, messageId) {
  if (!ids.length) return;
  const { rows } = await client.query(
    `UPDATE attachments SET message_id = $2
      WHERE id = ANY($1::uuid[]) AND message_id IS NULL
      RETURNING id`,
    [ids, messageId],
  );
  if (rows.length !== ids.length) {
    throw badRequest('One or more attachments are no longer available.');
  }
}

export async function getAttachmentsForMessages(messageIds) {
  if (!messageIds.length) return new Map();
  const { rows } = await query(
    `SELECT * FROM attachments
      WHERE message_id = ANY($1::uuid[])
      ORDER BY created_at ASC`,
    [messageIds],
  );
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.message_id)) grouped.set(row.message_id, []);
    grouped.get(row.message_id).push(mapAttachment(row));
  }
  return grouped;
}

export async function copyAttachments(client, sourceMessageId, targetMessageId, uploaderId) {
  await client.query(
    `INSERT INTO attachments
      (message_id, uploader_id, url, public_id, name, mime_type, size_bytes, width, height, duration_ms, provider)
     SELECT $2, $3, url, public_id, name, mime_type, size_bytes, width, height, duration_ms, provider
       FROM attachments WHERE message_id = $1`,
    [sourceMessageId, targetMessageId, uploaderId],
  );
}
