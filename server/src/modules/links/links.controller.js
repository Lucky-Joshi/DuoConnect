import { z } from 'zod';
import { asyncHandler } from '../../utils/async-handler.js';
import * as service from './links.service.js';

export const preview = asyncHandler(async (req, res) => {
  const { url } = z.object({ url: z.string().min(1).max(2048) }).parse(req.valid.body);
  res.json({ data: await service.fetchLinkPreview(url) });
});
