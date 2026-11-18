import { z } from 'zod';
import { asyncHandler } from '../../utils/async-handler.js';
import { uuidSchema } from '../../utils/validation.js';
import * as service from './friends.service.js';

const requestSchema = z.object({
  userId: uuidSchema,
  message: z.string().trim().max(200).optional().nullable(),
});

export const list = asyncHandler(async (req, res) => {
  res.json({ data: await service.listFriends(req.user.id) });
});

export const requests = asyncHandler(async (req, res) => {
  res.json({ data: await service.listRequests(req.user.id) });
});

export const sendRequest = asyncHandler(async (req, res) => {
  const { userId, message } = requestSchema.parse(req.body);
  res.status(201).json({ data: await service.sendRequest(req.user.id, userId, message) });
});

export const accept = asyncHandler(async (req, res) => {
  const { requestId } = z.object({ requestId: uuidSchema }).parse(req.valid.params);
  res.json({ data: await service.acceptRequest(requestId, req.user.id) });
});

export const decline = asyncHandler(async (req, res) => {
  const { requestId } = z.object({ requestId: uuidSchema }).parse(req.valid.params);
  res.json({ data: await service.declineRequest(requestId, req.user.id) });
});

export const cancel = asyncHandler(async (req, res) => {
  const { requestId } = z.object({ requestId: uuidSchema }).parse(req.valid.params);
  res.json({ data: await service.cancelRequest(requestId, req.user.id) });
});

export const remove = asyncHandler(async (req, res) => {
  const { friendId } = z.object({ friendId: uuidSchema }).parse(req.valid.params);
  res.json({ data: await service.removeFriend(req.user.id, friendId) });
});

export const block = asyncHandler(async (req, res) => {
  const { userId } = z.object({ userId: uuidSchema }).parse(req.body);
  res.json({ data: await service.block(req.user.id, userId) });
});

export const unblock = asyncHandler(async (req, res) => {
  const { userId } = z.object({ userId: uuidSchema }).parse(req.valid.params);
  res.json({ data: await service.unblock(req.user.id, userId) });
});

export const blocked = asyncHandler(async (req, res) => {
  res.json({ data: await service.listBlocked(req.user.id) });
});
