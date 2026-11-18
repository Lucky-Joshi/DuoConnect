import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { tooMany } from '../utils/errors.js';

const skip = () => env.isTest;

function createLimiter({ windowMs, limit, message }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip,
    handler: (req, res, next) => next(tooMany(message)),
  });
}

export const globalLimiter = createLimiter({
  windowMs: 60 * 1000,
  limit: 400,
  message: 'Too many requests. Please slow down.',
});

export const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  message: 'Too many authentication attempts. Try again in a few minutes.',
});

export const uploadLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 120,
  message: 'Upload limit reached. Try again later.',
});

export const messageLimiter = createLimiter({
  windowMs: 60 * 1000,
  limit: 120,
  message: 'You are sending messages too quickly.',
});
