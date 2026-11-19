import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { authLimiter, lookupLimiter } from '../../middleware/rate-limit.js';
import { uuidSchema } from '../../utils/validation.js';
import { z } from 'zod';
import * as controller from './auth.controller.js';
import * as schemas from './auth.validation.js';

const router = Router();

router.get(
  '/username-available',
  lookupLimiter,
  validate({ query: schemas.usernameCheckSchema }),
  controller.checkUsername,
);
router.post(
  '/register',
  authLimiter,
  validate({ body: schemas.registerSchema }),
  controller.register,
);
router.post('/login', authLimiter, validate({ body: schemas.loginSchema }), controller.login);
router.post('/refresh', controller.refresh);
router.post('/logout', controller.logout);

router.use(requireAuth);
router.get('/me', controller.me);
router.post(
  '/change-password',
  validate({ body: schemas.changePasswordSchema }),
  controller.changePassword,
);
router.delete(
  '/account',
  validate({ body: schemas.deleteAccountSchema }),
  controller.deleteAccount,
);
router.get('/sessions', controller.sessions);
router.delete(
  '/sessions/:sessionId',
  validate({ params: z.object({ sessionId: uuidSchema }) }),
  controller.revokeSession,
);

export default router;
