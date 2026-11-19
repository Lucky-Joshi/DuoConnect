import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { linkLimiter } from '../../middleware/rate-limit.js';
import * as controller from './links.controller.js';

const router = Router();

router.use(requireAuth);

router.post(
  '/',
  linkLimiter,
  validate({ body: z.object({ url: z.string().min(1).max(2048) }) }),
  controller.preview,
);

export default router;
