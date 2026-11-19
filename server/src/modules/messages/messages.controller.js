import { z } from 'zod';
import { asyncHandler } from '../../utils/async-handler.js';
import { uuidSchema } from '../../utils/validation.js';
import { MAX_MESSAGE_LENGTH } from '../../config/constants.js';
import * as service from './messages.service.js';

export const edit = asyncHandler(async (req, res) => {
  const { messageId } = z.object({ messageId: uuidSchema }).parse(req.valid.params);
  const { body } = z
    .object({ body: z.string().min(1).max(MAX_MESSAGE_LENGTH) })
    .parse(req.valid.body);
  res.json({ data: await service.editMessage(req.user.id, messageId, body) });
});

export const remove = asyncHandler(async (req, res) => {
  const { messageId } = z.object({ messageId: uuidSchema }).parse(req.valid.params);
  res.json({ data: await service.deleteMessage(req.user.id, messageId) });
});

export const pin = asyncHandler(async (req, res) => {
  const { messageId } = z.object({ messageId: uuidSchema }).parse(req.valid.params);
  res.json({ data: await service.setPinned(req.user.id, messageId, true) });
});

export const unpin = asyncHandler(async (req, res) => {
  const { messageId } = z.object({ messageId: uuidSchema }).parse(req.valid.params);
  res.json({ data: await service.setPinned(req.user.id, messageId, false) });
});

export const react = asyncHandler(async (req, res) => {
  const { messageId } = z.object({ messageId: uuidSchema }).parse(req.valid.params);
  const { emoji } = z.object({ emoji: z.string().min(1).max(16) }).parse(req.valid.body);
  res.json({ data: await service.toggleReaction(req.user.id, messageId, emoji) });
});

export const forward = asyncHandler(async (req, res) => {
  const { messageId } = z.object({ messageId: uuidSchema }).parse(req.valid.params);
  const { chatId } = z.object({ chatId: uuidSchema }).parse(req.valid.body);
  res.status(201).json({ data: await service.forwardMessage(req.user.id, messageId, chatId) });
});

export const search = asyncHandler(async (req, res) => {
  const { q } = z.object({ q: z.string().trim().min(2).max(120) }).parse(req.query);
  res.json({ data: await service.searchAll(req.user.id, q) });
});
