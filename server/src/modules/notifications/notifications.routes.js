import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './notifications.controller.js';
import * as pushController from './push.controller.js';
import { subscribeSchema, unsubscribeSchema } from './push.validation.js';

const router = Router();

router.use(requireAuth);
router.get('/push/public-key', pushController.publicKey);
router.post('/push/subscribe', validate({ body: subscribeSchema }), pushController.subscribe);
router.delete(
  '/push/unsubscribe',
  validate({ body: unsubscribeSchema }),
  pushController.unsubscribe,
);
router.get('/', controller.list);
router.get('/summary', controller.summary);
router.post('/read-all', controller.markAllRead);
router.delete('/read', controller.clearRead);
router.post('/:id/read', controller.markRead);
router.delete('/:id', controller.remove);

export default router;
