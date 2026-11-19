import { z } from 'zod';
import { badRequest } from '../../utils/errors.js';
import { uuidSchema } from '../../utils/validation.js';
import { MAX_MESSAGE_LENGTH } from '../../config/constants.js';
import { emitToUsers } from '../events.js';
import * as chatsRepo from '../../modules/chats/chats.repository.js';
import * as messagesService from '../../modules/messages/messages.service.js';
import { createRateGate, registerHandler } from './shared.js';

const TYPING_TTL_MS = 5_000;
const TYPING_REBROADCAST_MS = 1_500;

const chatIdSchema = z.object({ chatId: uuidSchema });

const sendSchema = z.object({
  chatId: uuidSchema,
  body: z.string().max(MAX_MESSAGE_LENGTH).optional().default(''),
  type: z.enum(['text', 'image', 'file', 'voice', 'sticker']).optional().default('text'),
  replyToId: uuidSchema.nullish(),
  attachmentIds: z.array(uuidSchema).max(10).optional().default([]),
  clientId: z.string().max(64).optional(),
});

const readSchema = z.object({
  chatId: uuidSchema,
  messageId: uuidSchema.nullish(),
  uptoSeq: z.coerce.number().int().nonnegative().nullish(),
});

async function assertMember(chatId, userId) {
  const membership = await chatsRepo.getMembership(chatId, userId);
  if (!membership) throw badRequest('You are not part of this conversation.');
  return membership;
}

/**
 * Chat-level socket events: sending, read receipts, and typing indicators.
 * Everything is validated and acknowledged so the UI can reconcile optimistic
 * updates with server truth.
 */
export default function registerChatHandlers(socket) {
  const userId = socket.data.userId;
  const displayName = socket.data.displayName;
  const typingByChat = new Map();
  const sendGate = createRateGate({ limit: 30, windowMs: 10_000 });
  const typingGate = createRateGate({ limit: 50, windowMs: 10_000 });

  async function broadcastTyping(chatId, active) {
    const memberIds = await chatsRepo.getMemberIds(chatId);
    emitToUsers(
      memberIds,
      'typing:update',
      {
        chatId,
        userId,
        displayName,
        active,
        expiresAt: active ? new Date(Date.now() + TYPING_TTL_MS).toISOString() : null,
      },
      { exclude: userId },
    );
  }

  function clearTyping(chatId, notify = true) {
    const entry = typingByChat.get(chatId);
    if (!entry) return;
    clearTimeout(entry.timer);
    typingByChat.delete(chatId);
    if (notify) broadcastTyping(chatId, false).catch(() => {});
  }

  function stopAllTyping() {
    for (const chatId of [...typingByChat.keys()]) {
      const entry = typingByChat.get(chatId);
      clearTimeout(entry.timer);
      typingByChat.delete(chatId);
      broadcastTyping(chatId, false).catch(() => {});
    }
  }

  registerHandler(socket, 'message:send', async (payload) => {
    sendGate();
    const input = sendSchema.parse(payload);
    await assertMember(input.chatId, userId);

    const { message } = await messagesService.sendMessage(userId, input.chatId, {
      body: input.body,
      type: input.type,
      replyToId: input.replyToId ?? null,
      attachmentIds: input.attachmentIds,
      clientId: input.clientId ?? null,
    });
    clearTyping(input.chatId);
    return message;
  });

  registerHandler(socket, 'message:read', async (payload) => {
    const input = readSchema.parse(payload);
    await assertMember(input.chatId, userId);
    return messagesService.markRead(userId, input.chatId, {
      messageId: input.messageId ?? null,
      uptoSeq: input.uptoSeq ?? null,
    });
  });

  registerHandler(socket, 'message:delivered', async () =>
    messagesService.markDeliveredForUser(userId),
  );

  registerHandler(socket, 'typing:start', async (payload) => {
    typingGate();
    const { chatId } = chatIdSchema.parse(payload);
    await assertMember(chatId, userId);

    const existing = typingByChat.get(chatId);
    if (existing) {
      clearTimeout(existing.timer);
      // Re-broadcast at most every 1.5s so a fast typist does not flood the room.
      if (Date.now() - existing.sentAt < TYPING_REBROADCAST_MS) {
        existing.timer = setTimeout(() => clearTyping(chatId), TYPING_TTL_MS);
        return { typing: true };
      }
      existing.sentAt = Date.now();
    } else {
      typingByChat.set(chatId, { sentAt: Date.now(), timer: null });
    }

    const entry = typingByChat.get(chatId);
    entry.timer = setTimeout(() => clearTyping(chatId), TYPING_TTL_MS);
    await broadcastTyping(chatId, true);
    return { typing: true };
  });

  registerHandler(socket, 'typing:stop', async (payload) => {
    const { chatId } = chatIdSchema.parse(payload);
    clearTyping(chatId);
    return { typing: false };
  });

  return {
    cleanup() {
      stopAllTyping();
    },
  };
}
