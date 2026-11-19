import { asyncHandler } from '../../utils/async-handler.js';
import * as service from './push.service.js';

export const publicKey = asyncHandler(async (_req, res) => {
  res.json({ data: service.publicKey() });
});

export const subscribe = asyncHandler(async (req, res) => {
  res.json({ data: await service.subscribe(req.user.id, req.valid.body) });
});

export const unsubscribe = asyncHandler(async (req, res) => {
  res.json({ data: await service.unsubscribe(req.user.id, req.valid.body.endpoint) });
});
