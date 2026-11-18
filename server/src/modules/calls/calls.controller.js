import { z } from 'zod';
import { asyncHandler } from '../../utils/async-handler.js';
import { uuidSchema } from '../../utils/validation.js';
import * as service from './calls.service.js';

export const history = asyncHandler(async (req, res) => {
  const { limit } = z
    .object({ limit: z.coerce.number().int().min(1).max(100).optional().default(50) })
    .parse(req.query);
  res.json({ data: await service.history(req.user.id, limit) });
});

export const getCall = asyncHandler(async (req, res) => {
  const { callId } = z.object({ callId: uuidSchema }).parse(req.params);
  res.json({ data: await service.getCallForParticipant(callId, req.user.id) });
});
