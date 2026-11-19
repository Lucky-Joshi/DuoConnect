import { z } from 'zod';
import { asyncHandler } from '../../utils/async-handler.js';
import * as chats from './chats.service.js';
import * as messages from '../messages/messages.service.js';
import { uuidSchema } from '../../utils/validation.js';
import { MAX_MESSAGE_LENGTH } from '../../config/constants.js';

const chatParams = z.object({ chatId: uuidSchema });

const messageListQuery = z.object({
  cursor: z.coerce.number().int().nonnegative().optional(),
  around: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(80).optional().default(40),
});

const sendMessageSchema = z.object({
  body: z.string().max(MAX_MESSAGE_LENGTH).optional().default(''),
  type: z.enum(['text', 'image', 'file', 'voice', 'sticker']).optional().default('text'),
  replyToId: uuidSchema.nullish(),
  attachmentIds: z.array(uuidSchema).max(10).optional().default([]),
  clientId: z.string().max(64).optional(),
});

const readSchema = z.object({
  messageId: uuidSchema.nullish(),
  uptoSeq: z.coerce.number().int().nonnegative().nullish(),
});

const preferencesSchema = z
  .object({
    pinned: z.boolean().optional(),
    muted: z.boolean().optional(),
  })
  .refine((value) => value.pinned !== undefined || value.muted !== undefined, {
    message: 'Nothing to update.',
  });

export const list = asyncHandler(async (req, res) => {
  res.json({ data: await chats.listForUser(req.user.id) });
});

export const createDirect = asyncHandler(async (req, res) => {
  const { userId } = z.object({ userId: uuidSchema }).parse(req.body);
  res.status(201).json({ data: await chats.createDirect(req.user.id, userId) });
});

export const detail = asyncHandler(async (req, res) => {
  const { chatId } = chatParams.parse(req.valid.params);
  res.json({ data: await chats.getDetail(chatId, req.user.id) });
});

export const updatePreferences = asyncHandler(async (req, res) => {
  const { chatId } = chatParams.parse(req.valid.params);
  const body = preferencesSchema.parse(req.body);
  res.json({ data: await chats.updatePreferences(chatId, req.user.id, body) });
});

export const listMessages = asyncHandler(async (req, res) => {
  const { chatId } = chatParams.parse(req.valid.params);
  const query = messageListQuery.parse(req.valid.query);
  res.json({ data: await messages.listMessages(chatId, req.user.id, query) });
});

export const sendMessage = asyncHandler(async (req, res) => {
  const { chatId } = chatParams.parse(req.valid.params);
  const body = sendMessageSchema.parse(req.body);
  const result = await messages.sendMessage(req.user.id, chatId, body);
  res.status(201).json({ data: result.message });
});

export const markRead = asyncHandler(async (req, res) => {
  const { chatId } = chatParams.parse(req.valid.params);
  const body = readSchema.parse(req.body ?? {});
  res.json({ data: await messages.markRead(req.user.id, chatId, body) });
});

export const searchMessages = asyncHandler(async (req, res) => {
  const { chatId } = chatParams.parse(req.valid.params);
  const { q } = z.object({ q: z.string().trim().min(2).max(120) }).parse(req.valid.query);
  res.json({ data: await messages.searchInChat(chatId, req.user.id, q) });
});

export const pinned = asyncHandler(async (req, res) => {
  const { chatId } = chatParams.parse(req.valid.params);
  res.json({ data: await messages.listPinned(chatId, req.user.id) });
});
