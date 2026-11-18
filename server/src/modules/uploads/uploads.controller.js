import { asyncHandler } from '../../utils/async-handler.js';
import { badRequest } from '../../utils/errors.js';
import { saveBuffer, validateUpload } from '../../services/storage.js';
import { clampInt } from '../../utils/sanitize.js';
import * as repo from './uploads.repository.js';

export const uploadFile = asyncHandler(async (req, res) => {
  const file = req.file;
  validateUpload(file);

  const stored = await saveBuffer(file, { folder: 'chat' });
  const durationMs = req.body?.durationMs
    ? clampInt(req.body.durationMs, 0, 60 * 60 * 1000, null)
    : null;

  const attachment = await repo.createAttachment({
    uploaderId: req.user.id,
    url: stored.url,
    publicId: stored.publicId,
    name: (file.originalname || 'attachment').slice(0, 200),
    mimeType: file.mimetype,
    sizeBytes: file.size,
    durationMs,
    provider: stored.provider,
  });

  res.status(201).json({ data: attachment });
});

export const uploadAvatar = asyncHandler(async (req, res) => {
  const file = req.file;
  validateUpload(file, { imagesOnly: true });
  if (file.size > 5 * 1024 * 1024) {
    throw badRequest('Profile photos need to be smaller than 5 MB.');
  }

  const stored = await saveBuffer(file, { folder: 'avatars' });
  res.status(201).json({ data: stored });
});
