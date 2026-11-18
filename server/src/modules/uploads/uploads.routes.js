import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { uploadLimiter } from '../../middleware/rate-limit.js';
import { singleFileUpload, singleAvatarUpload } from '../../middleware/upload.js';
import * as controller from './uploads.controller.js';

const router = Router();

router.use(requireAuth);
router.post('/', uploadLimiter, singleFileUpload, controller.uploadFile);
router.post('/avatar', uploadLimiter, singleAvatarUpload, controller.uploadAvatar);

export default router;
