import { AppError, badRequest, forbidden, notFound } from '../../utils/errors.js';
import { cleanText } from '../../utils/sanitize.js';
import { mapMessage } from '../../utils/serialize.js';
import { withTransaction, query } from '../../db/index.js';
import { MAX_MESSAGE_LENGTH } from '../../config/constants.js';
import { emitToUsers } from '../../realtime/events.js';
import { deleteStoredFile } from '../../services/storage.js';
import * as chatsRepo from '../chats/chats.repository.js';
import * as attachmentsRepo from '../uploads/uploads.repository.js';
import { notify } from '../notifications/notifications.service.js';
import * as repo from './messages.repository.js';

const IMAGE_MIME = /^image\//;
const AUDIO_MIME = /^audio\//;

function previewFor(message) {
  if (message.type === 'image') return 'Photo';
  if (message.type === 'voice') return 'Voice message';
  if (message.type === 'file') return message.attachments[0]?.name || 'Attachment';
  return (message.body || '').slice(0, 140);
}

async function assertMember(chatId, userId, { write = false } = {}) {
  const access = await chatsRepo.getAccessState(chatId, userId);
  if (!access) throw notFound('Conversation not found.');
  if (!write || access.canMessage) return access;

  const messages = {
    blocked_by_me: 'Unblock this person before sending a message.',
    blocked_me: 'You can no longer send messages in this conversation.',
    not_friends: 'You are no longer friends. Send a new friend request to continue.',
    peer_missing: 'This conversation is no longer available.',
  };
  throw new AppError(
    403,
    'CHAT_READ_ONLY',
    messages[access.reason] ?? 'This conversation is read-only.',
    {
      reason: access.reason,
    },
  );
}

async function hydrate(rows) {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const [attachments, receiptsMap, pinned] = await Promise.all([
    attachmentsRepo.getAttachmentsForMessages(ids),
    repo.getReceiptsForMessages(ids),
    repo.getPinnedIdsForMessages(ids),
  ]);

  return rows.map((row) =>
    mapMessage(row, {
      attachments: attachments.get(row.id) ?? [],
      receipts: (receiptsMap.get(row.id) ?? []).map((receipt) => ({
        ...receipt,
        read_at: receipt.read_receipts_enabled === false ? null : receipt.read_at,
      })),
      pinned: pinned.has(row.id),
    }),
  );
}

async function hydrateOne(messageId) {
  const row = await repo.getMessageRow(messageId);
  if (!row) return null;
  const [message] = await hydrate([row]);
  return message;
}

function resolveType(requestedType, attachments) {
  const hasImage = attachments.some((item) => IMAGE_MIME.test(item.mime_type));
  const hasAudio = attachments.some((item) => AUDIO_MIME.test(item.mime_type));

  if (requestedType === 'voice') {
    if (attachments.length !== 1 || !hasAudio) {
      throw badRequest('Voice notes need a single audio attachment.');
    }
    return 'voice';
  }
  if (requestedType === 'image') {
    if (!hasImage) throw badRequest('Image messages need an image attachment.');
    return 'image';
  }
  if (requestedType === 'file') {
    if (!attachments.length) throw badRequest('File messages need an attachment.');
    return 'file';
  }
  if (!attachments.length) return 'text';
  if (attachments.length === 1 && hasAudio) return 'voice';
  if (hasImage) return 'image';
  return 'file';
}

async function emitNewMessage(message, memberIds, clientId = null) {
  emitToUsers(memberIds, 'message:new', { ...message, clientId });
}

async function notifyOfflineMembers(chatId, senderId, message) {
  const members = await repo.getChatMemberPresence(chatId);
  const recipients = members.filter(
    (member) => member.user_id !== senderId && member.socket_count === 0,
  );

  await Promise.all(
    recipients.map((member) =>
      notify({
        userId: member.user_id,
        actorId: senderId,
        type: 'message',
        chatId,
        payload: {
          title: message.sender.displayName,
          body: previewFor(message),
          messageId: message.id,
        },
      }),
    ),
  );
}

export async function listMessages(chatId, userId, { cursor = null, around = null, limit = 40 }) {
  await assertMember(chatId, userId);

  if (around) {
    const page = await repo.listAround(chatId, around, limit);
    const messages = await hydrate(page.rows);
    return {
      items: messages,
      hasMore: page.hasMoreOlder,
      hasMoreNewer: page.hasMoreNewer,
      nextCursor: messages.length ? Math.max(0, messages[0].seq - 1) : null,
    };
  }

  const page = await repo.listLatest(chatId, { cursor, limit });
  const messages = await hydrate(page.rows);
  return {
    items: messages,
    hasMore: page.hasMore,
    hasMoreNewer: false,
    nextCursor: page.oldestSeq !== null ? Math.max(0, page.oldestSeq - 1) : null,
  };
}

export async function sendMessage(userId, chatId, input) {
  const access = await assertMember(chatId, userId, { write: true });
  const memberIds = await chatsRepo.getMemberIds(chatId);

  const attachmentIds = input.attachmentIds ?? [];
  const attachments = await attachmentsRepo.getUnclaimedAttachments(attachmentIds, userId);
  if (attachments.length !== attachmentIds.length) {
    throw badRequest('One or more attachments are no longer available. Upload them again.');
  }

  const type = resolveType(input.type ?? 'text', attachments);
  const body = cleanText(input.body ?? '', {
    maxLength: type === 'text' ? MAX_MESSAGE_LENGTH : 2000,
  });
  if (type === 'text' && !body) throw badRequest('Write a message before sending.');

  let replyToId = input.replyToId ?? null;
  if (replyToId) {
    const replyInfo = await repo.getMessageChatInfo(replyToId);
    if (!replyInfo || replyInfo.chat_id !== chatId) {
      throw badRequest('The message you are replying to is not in this conversation.');
    }
    if (replyInfo.deleted_at) replyToId = null;
  }

  const messageId = await withTransaction(async (tx) => {
    const id = await repo.insertMessage(tx, {
      chatId,
      senderId: userId,
      type,
      body,
      replyToId,
      metadata: {},
    });
    await attachmentsRepo.claimAttachments(tx, attachmentIds, id);
    await repo.insertReceipts(tx, id, chatId, userId);
    await tx.query('UPDATE chats SET last_message_at = now(), updated_at = now() WHERE id = $1', [
      chatId,
    ]);
    return id;
  });

  const message = await hydrateOne(messageId);
  await emitNewMessage(message, memberIds, input.clientId ?? null);
  await notifyOfflineMembers(chatId, userId, message);

  return { message, access };
}

export async function markRead(userId, chatId, { messageId = null, uptoSeq = null } = {}) {
  await assertMember(chatId, userId);

  let seq = uptoSeq;
  if (!seq && messageId) seq = await repo.getSeqForMessage(chatId, messageId);
  if (!seq) seq = await repo.getLatestSeq(chatId);

  const rows = await repo.markRead(chatId, userId, seq);
  await chatsRepo.setLastReadSeq(chatId, userId, seq);

  const { rows: settingsRows } = await query(
    'SELECT read_receipts FROM user_settings WHERE user_id = $1',
    [userId],
  );
  const shareReceipts = settingsRows[0]?.read_receipts !== false;

  if (shareReceipts && rows.length) {
    const grouped = new Map();
    for (const row of rows) {
      if (!grouped.has(row.sender_id)) grouped.set(row.sender_id, []);
      grouped.get(row.sender_id).push(row.message_id);
    }
    for (const [senderId, messageIds] of grouped) {
      emitToUsers([senderId], 'message:read', { chatId, messageIds, readerId: userId });
    }
  }

  emitToUsers([userId], 'chat:read', { chatId, lastReadSeq: Number(seq), shared: shareReceipts });
  return { read: rows.length, lastReadSeq: Number(seq), shared: shareReceipts };
}

export async function markDeliveredForUser(userId) {
  const rows = await repo.markDelivered(userId);
  if (!rows.length) return { delivered: 0 };

  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.sender_id)) grouped.set(row.sender_id, []);
    grouped.get(row.sender_id).push(row.message_id);
  }
  for (const [senderId, messageIds] of grouped) {
    emitToUsers([senderId], 'message:delivered', { messageIds, recipientId: userId });
  }

  return { delivered: rows.length };
}

export async function editMessage(userId, messageId, bodyInput) {
  const info = await repo.getMessageChatInfo(messageId);
  if (!info) throw notFound('Message not found.');
  await assertMember(info.chat_id, userId, { write: true });
  if (info.sender_id !== userId) throw forbidden('You can only edit your own messages.');
  if (info.deleted_at) throw badRequest('Deleted messages cannot be edited.');

  const row = await repo.getMessageRow(messageId);
  if (row.type !== 'text') throw badRequest('Only text messages can be edited.');
  const body = cleanText(bodyInput, { maxLength: MAX_MESSAGE_LENGTH });
  if (!body) throw badRequest('A message cannot be empty.');

  await repo.updateMessageBody(messageId, body);
  const message = await hydrateOne(messageId);
  const memberIds = await chatsRepo.getMemberIds(info.chat_id);
  emitToUsers(memberIds, 'message:updated', message);
  return message;
}

export async function deleteMessage(userId, messageId) {
  const info = await repo.getMessageChatInfo(messageId);
  if (!info) throw notFound('Message not found.');
  await assertMember(info.chat_id, userId, { write: true });
  if (info.sender_id !== userId) throw forbidden('You can only delete your own messages.');
  if (info.deleted_at) return { success: true };

  const files = await repo.deleteAttachmentsForMessage(messageId);
  await repo.softDeleteMessage(messageId);
  await repo.deletePinsForMessage(messageId);
  await Promise.all(files.map((file) => deleteStoredFile(file)));

  const message = await hydrateOne(messageId);
  const memberIds = await chatsRepo.getMemberIds(info.chat_id);
  emitToUsers(memberIds, 'message:deleted', message);
  emitToUsers(memberIds, 'message:pinned', { chatId: info.chat_id, messageId, pinned: false });

  return { success: true };
}

export async function setPinned(userId, messageId, pinned) {
  const info = await repo.getMessageChatInfo(messageId);
  if (!info) throw notFound('Message not found.');
  await assertMember(info.chat_id, userId);
  if (pinned && info.deleted_at) throw badRequest('Deleted messages cannot be pinned.');

  if (pinned) await repo.pinMessage(info.chat_id, messageId, userId);
  else await repo.unpinMessage(info.chat_id, messageId);

  const memberIds = await chatsRepo.getMemberIds(info.chat_id);
  emitToUsers(memberIds, 'message:pinned', { chatId: info.chat_id, messageId, pinned });

  return { pinned, chatId: info.chat_id, messageId };
}

export async function listPinned(chatId, userId) {
  await assertMember(chatId, userId);
  const rows = await repo.listPinned(chatId);
  return hydrate(rows);
}

export async function searchInChat(chatId, userId, term) {
  await assertMember(chatId, userId);
  if (!term || term.trim().length < 2) return [];
  const rows = await repo.searchInChat(chatId, term.trim());
  return hydrate(rows);
}

export async function searchAll(userId, term) {
  if (!term || term.trim().length < 2) return [];
  const rows = await repo.searchAcrossChats(userId, term.trim());
  return hydrate(rows);
}

export async function forwardMessage(userId, messageId, targetChatId) {
  const source = await hydrateOne(messageId);
  if (!source) throw notFound('Message not found.');
  await assertMember(source.chatId, userId);
  if (source.deletedAt) throw badRequest('Deleted messages cannot be forwarded.');
  await assertMember(targetChatId, userId, { write: true });

  const messageIdNew = await withTransaction(async (tx) => {
    const id = await repo.insertMessage(tx, {
      chatId: targetChatId,
      senderId: userId,
      type: source.type,
      body: source.body,
      replyToId: null,
      forwardedFromId: messageId,
      metadata: {},
    });
    await attachmentsRepo.copyAttachments(tx, messageId, id, userId);
    await repo.insertReceipts(tx, id, targetChatId, userId);
    await tx.query('UPDATE chats SET last_message_at = now(), updated_at = now() WHERE id = $1', [
      targetChatId,
    ]);
    return id;
  });

  const message = await hydrateOne(messageIdNew);
  const memberIds = await chatsRepo.getMemberIds(targetChatId);
  await emitNewMessage(message, memberIds);
  await notifyOfflineMembers(targetChatId, userId, message);
  return message;
}
