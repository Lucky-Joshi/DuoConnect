import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import * as controller from './notifications.controller.js';

const router = Router();

router.use(requireAuth);
router.get('/', controller.list);
router.get('/summary', controller.summary);
router.post('/read-all', controller.markAllRead);
router.delete('/read', controller.clearRead);
router.post('/:id/read', controller.markRead);
router.delete('/:id', controller.remove);

export default router;
