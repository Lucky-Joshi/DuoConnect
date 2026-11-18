import fs from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import mimeTypes from 'mime-types';
import { env } from '../config/env.js';
import { badRequest } from '../utils/errors.js';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

const FILE_TYPES = new Set([
  ...IMAGE_TYPES,
  'application/pdf',
  'application/zip',
  'application/json',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'text/markdown',
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/x-wav',
  'video/mp4',
  'video/webm',
]);

let cloudinaryClient = null;

async function getCloudinary() {
  if (!env.cloudinaryEnabled) return null;
  if (cloudinaryClient) return cloudinaryClient;
  const { v2 } = await import('cloudinary');
  v2.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
  });
  cloudinaryClient = v2;
  return cloudinaryClient;
}

export function validateUpload(file, { imagesOnly = false } = {}) {
  if (!file) throw badRequest('Choose a file to upload.');
  const allowed = imagesOnly ? IMAGE_TYPES : FILE_TYPES;
  if (!allowed.has(file.mimetype)) {
    throw badRequest(
      imagesOnly ? 'Use a JPG, PNG, WebP, GIF, or AVIF image.' : 'This file type is not supported.',
    );
  }
}

function extensionFor(file) {
  const fromName = path.extname(file.originalname || '').toLowerCase();
  if (/^\.[a-z0-9]{1,8}$/.test(fromName)) return fromName;
  const fromMime = mimeTypes.extension(file.mimetype);
  return fromMime ? `.${fromMime}` : '';
}

export async function saveBuffer(file, { folder = 'files' } = {}) {
  const cloudinary = await getCloudinary();
  if (cloudinary) {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `${env.CLOUDINARY_FOLDER}/${folder}`,
          resource_type: 'auto',
          use_filename: false,
          unique_filename: true,
        },
        (error, result) => {
          if (error || !result) return reject(error ?? new Error('Cloudinary upload failed.'));
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            provider: 'cloudinary',
          });
        },
      );
      stream.end(file.buffer);
    });
  }

  const now = new Date();
  const relativeDir = path.join(
    folder,
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
  );
  const targetDir = path.join(env.uploadDir, relativeDir);
  await fs.mkdir(targetDir, { recursive: true });

  const filename = `${nanoid(20)}${extensionFor(file)}`;
  await fs.writeFile(path.join(targetDir, filename), file.buffer);

  const publicId = path.posix.join(relativeDir.split(path.sep).join('/'), filename);
  return { url: `/uploads/${publicId}`, publicId, provider: 'local' };
}

export async function deleteStoredFile({ url, publicId, provider }) {
  try {
    if (provider === 'cloudinary') {
      const cloudinary = await getCloudinary();
      if (cloudinary && publicId) await cloudinary.uploader.destroy(publicId, { invalidate: true });
      return;
    }
    if (url?.startsWith('/uploads/')) {
      const absolute = path.join(env.uploadDir, url.replace('/uploads/', ''));
      const normalized = path.normalize(absolute);
      if (normalized.startsWith(env.uploadDir)) await fs.unlink(normalized).catch(() => {});
    }
  } catch {
    // Cleanup of media is best-effort; database state is the source of truth.
  }
}
