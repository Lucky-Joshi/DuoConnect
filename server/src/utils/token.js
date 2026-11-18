import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { unauthorized } from './errors.js';

export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      type: 'access',
    },
    env.JWT_ACCESS_SECRET,
    {
      expiresIn: env.ACCESS_TOKEN_TTL,
      issuer: 'duoconnect',
      audience: 'duoconnect-web',
    },
  );
}

export function verifyAccessToken(token) {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: 'duoconnect',
      audience: 'duoconnect-web',
    });
    if (payload.type !== 'access' || !payload.sub) {
      throw unauthorized('Invalid access token.', 'INVALID_TOKEN');
    }
    return payload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw unauthorized('Access token expired.', 'TOKEN_EXPIRED');
    }
    if (error.name === 'AppError') throw error;
    throw unauthorized('Invalid access token.', 'INVALID_TOKEN');
  }
}

export function createRefreshToken() {
  const token = crypto.randomBytes(48).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function refreshExpiryDate(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export function extractBearerToken(header) {
  if (!header || typeof header !== 'string') return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}
