import { asyncHandler } from '../../utils/async-handler.js';
import * as service from './users.service.js';

export const search = asyncHandler(async (req, res) => {
  const result = await service.search(req.user.id, req.valid.query);
  res.json({ data: result });
});

export const getProfile = asyncHandler(async (req, res) => {
  const result = await service.getProfile(req.valid.params.username, req.user.id);
  res.json({ data: result });
});

export const updateMe = asyncHandler(async (req, res) => {
  const result = await service.updateProfile(req.user.id, req.valid.body);
  res.json({ data: result });
});

export const updateMySettings = asyncHandler(async (req, res) => {
  const settings = await service.updateSettings(req.user.id, req.valid.body);
  res.json({ data: settings });
});
