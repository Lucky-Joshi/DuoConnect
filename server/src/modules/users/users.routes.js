import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './users.controller.js';
import * as schemas from './users.validation.js';

const router = Router();

router.use(requireAuth);

router.get('/search', validate({ query: schemas.searchUsersSchema }), controller.search);
router.patch('/me', validate({ body: schemas.updateProfileSchema }), controller.updateMe);
router.patch(
  '/me/settings',
  validate({ body: schemas.updateSettingsSchema }),
  controller.updateMySettings,
);
router.get('/:username', validate({ params: schemas.profileParamsSchema }), controller.getProfile);

export default router;
