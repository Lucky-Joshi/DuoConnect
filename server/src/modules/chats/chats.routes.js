import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { messageLimiter } from '../../middleware/rate-limit.js';
import { z } from 'zod';
import { uuidSchema } from '../../utils/validation.js';
import * as controller from './chats.controller.js';

const router = Router();

router.use(requireAuth);

const chatParams = z.object({ chatId: uuidSchema });

router.get('/', controller.list);
router.post('/direct', controller.createDirect);
router.get('/:chatId', validate({ params: chatParams }), controller.detail);
router.patch(
  '/:chatId/preferences',
  validate({ params: chatParams }),
  controller.updatePreferences,
);
router.get('/:chatId/messages', validate({ params: chatParams }), controller.listMessages);
router.post(
  '/:chatId/messages',
  messageLimiter,
  validate({ params: chatParams }),
  controller.sendMessage,
);
router.post('/:chatId/read', validate({ params: chatParams }), controller.markRead);
router.get('/:chatId/messages/search', validate({ params: chatParams }), controller.searchMessages);
router.get('/:chatId/pins', validate({ params: chatParams }), controller.pinned);

export default router;
