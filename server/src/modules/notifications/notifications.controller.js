import { z } from 'zod';
import { asyncHandler } from '../../utils/async-handler.js';
import { uuidSchema } from '../../utils/validation.js';
import * as service from './notifications.service.js';

const listQuerySchema = z.object({
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export const list = asyncHandler(async (req, res) => {
  const { before = null, limit } = listQuerySchema.parse(req.query);
  const items = await service.list(req.user.id, { before, limit });
  const summary = await service.summary(req.user.id);
  res.json({ data: { items, ...summary } });
});

export const summary = asyncHandler(async (req, res) => {
  res.json({ data: await service.summary(req.user.id) });
});

export const markRead = asyncHandler(async (req, res) => {
  const { id } = z.object({ id: uuidSchema }).parse(req.params);
  res.json({ data: await service.markRead(req.user.id, id) });
});

export const markAllRead = asyncHandler(async (req, res) => {
  res.json({ data: await service.markAllRead(req.user.id) });
});

export const remove = asyncHandler(async (req, res) => {
  const { id } = z.object({ id: uuidSchema }).parse(req.params);
  res.json({ data: await service.remove(req.user.id, id) });
});

export const clearRead = asyncHandler(async (req, res) => {
  res.json({ data: await service.clearRead(req.user.id) });
});
