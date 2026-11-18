import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { conflict, unauthorized, notFound, badRequest } from '../../utils/errors.js';
import { hashPassword, verifyPassword, burnPasswordCheck } from '../../utils/password.js';
import {
  createRefreshToken,
  hashToken,
  refreshExpiryDate,
  signAccessToken,
} from '../../utils/token.js';
import { normalizeEmail, normalizeUsername } from '../../utils/sanitize.js';
import { mapPublicUser, mapSettings, mapSession } from '../../utils/serialize.js';
import * as repo from './auth.repository.js';

function toAuthPayload(row) {
  return {
    user: mapPublicUser(row, { viewerId: row.id }),
    settings: mapSettings(row),
  };
}

async function issueSession(row, { remember = false, userAgent, ip, familyId = null } = {}) {
  const days = remember ? env.REMEMBER_ME_TTL_DAYS : env.REFRESH_TOKEN_TTL_DAYS;
  const { token, hash } = createRefreshToken();
  const expiresAt = refreshExpiryDate(days);

  await repo.insertRefreshToken(null, {
    id: crypto.randomUUID(),
    userId: row.id,
    tokenHash: hash,
    familyId: familyId ?? crypto.randomUUID(),
    expiresAt,
    userAgent,
    ip,
  });

  const payload = toAuthPayload(row);
  return {
    ...payload,
    accessToken: signAccessToken(payload.user),
    refreshToken: token,
    refreshMaxAge: remember ? days * 24 * 60 * 60 * 1000 : null,
    expiresAt,
  };
}

export async function register(input, meta = {}) {
  const email = normalizeEmail(input.email);
  const username = normalizeUsername(input.username);

  const taken = await repo.emailOrUsernameTaken(email, username);
  if (taken.email) throw conflict('An account with this email already exists.', 'EMAIL_TAKEN');
  if (taken.username) throw conflict('That username is taken. Try another one.', 'USERNAME_TAKEN');

  const passwordHash = await hashPassword(input.password);

  let userId;
  try {
    userId = await repo.createUser({
      email,
      username,
      displayName: input.displayName.trim(),
      passwordHash,
    });
  } catch (error) {
    if (error.code === '23505') {
      throw conflict('That email or username is already in use.', 'IDENTIFIER_TAKEN');
    }
    throw error;
  }

  const row = await repo.findUserById(userId);
  if (!row) throw notFound('We could not finish creating your account.');

  return issueSession(row, {
    remember: Boolean(input.remember),
    userAgent: meta.userAgent,
    ip: meta.ip,
  });
}

export async function login(input, meta = {}) {
  const row = await repo.findUserByIdentifier(input.identifier.trim());

  if (!row) {
    await burnPasswordCheck(input.password);
    throw unauthorized('Email, username, or password is incorrect.', 'INVALID_CREDENTIALS');
  }

  const valid = await verifyPassword(input.password, row.password_hash);
  if (!valid) {
    throw unauthorized('Email, username, or password is incorrect.', 'INVALID_CREDENTIALS');
  }

  return issueSession(row, {
    remember: Boolean(input.remember),
    userAgent: meta.userAgent,
    ip: meta.ip,
  });
}

export async function refresh(rawToken, meta = {}) {
  if (!rawToken)
    throw unauthorized('Your session has expired. Please sign in again.', 'SESSION_EXPIRED');
  const hash = hashToken(rawToken);
  const tokenRow = await repo.findRefreshToken(hash);

  if (!tokenRow) {
    throw unauthorized('Your session has expired. Please sign in again.', 'SESSION_EXPIRED');
  }

  if (tokenRow.revoked_at) {
    const revokedAgo = Date.now() - new Date(tokenRow.revoked_at).getTime();
    if (revokedAgo > 30_000) {
      await repo.revokeFamily(tokenRow.family_id);
    }
    throw unauthorized('Your session has expired. Please sign in again.', 'SESSION_EXPIRED');
  }

  if (new Date(tokenRow.expires_at).getTime() <= Date.now() || tokenRow.deleted_at) {
    throw unauthorized('Your session has expired. Please sign in again.', 'SESSION_EXPIRED');
  }

  const remember =
    new Date(tokenRow.expires_at).getTime() - new Date(tokenRow.created_at).getTime() >
    env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000 + 60_000;
  const days = remember ? env.REMEMBER_ME_TTL_DAYS : env.REFRESH_TOKEN_TTL_DAYS;
  const { token, hash: newHash } = createRefreshToken();
  const newTokenId = crypto.randomUUID();

  const familyId = await repo.rotateRefreshToken({
    oldToken: tokenRow,
    newToken: {
      id: newTokenId,
      tokenHash: newHash,
      expiresAt: refreshExpiryDate(days),
      userAgent: meta.userAgent,
      ip: meta.ip,
    },
  });

  if (!familyId) {
    throw unauthorized('Your session has expired. Please sign in again.', 'SESSION_EXPIRED');
  }

  const row = await repo.findUserById(tokenRow.user_id);
  if (!row) {
    await repo.revokeFamily(tokenRow.family_id);
    throw unauthorized('This account is no longer available.', 'ACCOUNT_UNAVAILABLE');
  }

  return {
    ...toAuthPayload(row),
    accessToken: signAccessToken(row),
    refreshToken: token,
    refreshMaxAge: remember ? days * 24 * 60 * 60 * 1000 : null,
  };
}

export async function logout(rawToken) {
  if (rawToken) await repo.revokeRefreshToken(hashToken(rawToken));
}

export async function me(userId) {
  const row = await repo.findUserById(userId);
  if (!row) throw notFound('Account not found.');
  return toAuthPayload(row);
}

export async function changePassword(
  userId,
  { currentPassword, newPassword },
  currentRefreshToken,
) {
  const row = await repo.findUserById(userId);
  if (!row) throw notFound('Account not found.');

  const valid = await verifyPassword(currentPassword, row.password_hash);
  if (!valid)
    throw badRequest('Your current password is incorrect.', [
      { path: 'currentPassword', message: 'Incorrect password.' },
    ]);

  const newHash = await hashPassword(newPassword);
  await repo.updatePassword(userId, newHash);

  const exceptHash = currentRefreshToken ? hashToken(currentRefreshToken) : null;
  await repo.revokeAllSessions(userId, exceptHash);

  return { success: true };
}

export async function deleteAccount(userId, password) {
  const row = await repo.findUserById(userId);
  if (!row) throw notFound('Account not found.');

  const valid = await verifyPassword(password, row.password_hash);
  if (!valid)
    throw badRequest('Password is incorrect.', [
      { path: 'password', message: 'Incorrect password.' },
    ]);

  await repo.softDeleteAccount(userId);
  return { success: true };
}

export async function getSessions(userId, currentRefreshToken) {
  const rows = await repo.listSessions(userId);
  const currentHash = currentRefreshToken ? hashToken(currentRefreshToken) : null;
  return rows.map((row) => mapSession(row, currentHash));
}

export async function revokeSession(userId, sessionId) {
  const revoked = await repo.revokeSession(userId, sessionId);
  if (!revoked) throw notFound('Session not found or already revoked.');
  return { success: true };
}
