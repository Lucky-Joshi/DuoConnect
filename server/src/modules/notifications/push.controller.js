import { asyncHandler } from '../../utils/async-handler.js';
import { AppError } from '../../utils/errors.js';
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

export const test = asyncHandler(async (req, res) => {
  const result = await service.sendTest(req.user.id);
  if (!result.enabled) {
    throw new AppError(400, 'PUSH_NOT_CONFIGURED', 'Web Push is not configured on the server.');
  }
  if (!result.sent) {
    throw new AppError(
      400,
      'NO_PUSH_SUBSCRIPTION',
      'No active push subscription found for this account.',
    );
  }
  res.json({ data: result });
});
