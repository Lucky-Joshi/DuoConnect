import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { z } from 'zod';
import { uuidSchema } from '../../utils/validation.js';
import * as controller from './calls.controller.js';

const router = Router();

router.use(requireAuth);
router.get('/', controller.history);
router.get('/active', controller.active);
router.get('/:callId', validate({ params: z.object({ callId: uuidSchema }) }), controller.getCall);

export default router;
