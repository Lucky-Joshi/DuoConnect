import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { messageLimiter } from '../../middleware/rate-limit.js';
import { z } from 'zod';
import { uuidSchema } from '../../utils/validation.js';
import * as controller from './messages.controller.js';

const router = Router();

router.use(requireAuth);

const messageParams = z.object({ messageId: uuidSchema });
const reactionBody = z.object({ emoji: z.string().min(1).max(16) });

router.get('/search', controller.search);
router.patch('/:messageId', messageLimiter, validate({ params: messageParams }), controller.edit);
router.delete('/:messageId', validate({ params: messageParams }), controller.remove);
router.post(
  '/:messageId/reactions',
  messageLimiter,
  validate({ params: messageParams, body: reactionBody }),
  controller.react,
);
router.post('/:messageId/pin', validate({ params: messageParams }), controller.pin);
router.delete('/:messageId/pin', validate({ params: messageParams }), controller.unpin);
router.post(
  '/:messageId/forward',
  messageLimiter,
  validate({ params: messageParams }),
  controller.forward,
);

export default router;
