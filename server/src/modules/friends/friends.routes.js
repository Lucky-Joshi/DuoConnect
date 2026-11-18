import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { z } from 'zod';
import { uuidSchema } from '../../utils/validation.js';
import * as controller from './friends.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/', controller.list);
router.get('/requests', controller.requests);
router.post('/requests', controller.sendRequest);
router.post(
  '/requests/:requestId/accept',
  validate({ params: z.object({ requestId: uuidSchema }) }),
  controller.accept,
);
router.post(
  '/requests/:requestId/decline',
  validate({ params: z.object({ requestId: uuidSchema }) }),
  controller.decline,
);
router.delete(
  '/requests/:requestId',
  validate({ params: z.object({ requestId: uuidSchema }) }),
  controller.cancel,
);
router.get('/blocked', controller.blocked);
router.post('/block', controller.block);
router.delete(
  '/block/:userId',
  validate({ params: z.object({ userId: uuidSchema }) }),
  controller.unblock,
);
router.delete(
  '/:friendId',
  validate({ params: z.object({ friendId: uuidSchema }) }),
  controller.remove,
);

export default router;
