import multer from 'multer';
import { env } from '../config/env.js';

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.MAX_UPLOAD_MB * 1024 * 1024,
    files: 1,
    fields: 8,
  },
});

export const singleFileUpload = upload.single('file');
export const singleAvatarUpload = upload.single('avatar');
