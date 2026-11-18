import { env } from '../../config/env.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as service from './auth.service.js';

function cookieOptions(maxAge) {
  const options = {
    httpOnly: true,
    secure: env.cookie.secure,
    sameSite: env.cookie.sameSite,
    path: env.cookie.path,
  };
  if (env.cookie.domain) options.domain = env.cookie.domain;
  if (typeof maxAge === 'number') options.maxAge = maxAge;
  return options;
}

function setSessionCookie(res, result) {
  res.cookie(env.cookie.name, result.refreshToken, cookieOptions(result.refreshMaxAge));
}

function clearSessionCookie(res) {
  res.clearCookie(env.cookie.name, cookieOptions(undefined));
}

function meta(req) {
  return {
    userAgent: (req.headers['user-agent'] || '').slice(0, 300) || null,
    ip: req.ip || null,
  };
}

const sessionResponse = (result) => ({
  user: result.user,
  settings: result.settings,
  accessToken: result.accessToken,
  refreshMaxAge: result.refreshMaxAge,
});

export const register = asyncHandler(async (req, res) => {
  const result = await service.register(req.valid.body, meta(req));
  setSessionCookie(res, result);
  res.status(201).json({ data: sessionResponse(result) });
});

export const login = asyncHandler(async (req, res) => {
  const result = await service.login(req.valid.body, meta(req));
  setSessionCookie(res, result);
  res.json({ data: sessionResponse(result) });
});

export const refresh = asyncHandler(async (req, res) => {
  const rawToken = req.cookies?.[env.cookie.name];
  if (!rawToken) {
    res.json({ data: null });
    return;
  }
  const result = await service.refresh(rawToken, meta(req));
  setSessionCookie(res, result);
  res.json({ data: sessionResponse(result) });
});

export const logout = asyncHandler(async (req, res) => {
  await service.logout(req.cookies?.[env.cookie.name]);
  clearSessionCookie(res);
  res.json({ data: { success: true } });
});

export const me = asyncHandler(async (req, res) => {
  const result = await service.me(req.user.id);
  res.json({ data: result });
});

export const changePassword = asyncHandler(async (req, res) => {
  const result = await service.changePassword(
    req.user.id,
    req.valid.body,
    req.cookies?.[env.cookie.name],
  );
  res.json({ data: result });
});

export const deleteAccount = asyncHandler(async (req, res) => {
  const result = await service.deleteAccount(req.user.id, req.valid.body.password);
  clearSessionCookie(res);
  res.json({ data: result });
});

export const sessions = asyncHandler(async (req, res) => {
  const result = await service.getSessions(req.user.id, req.cookies?.[env.cookie.name]);
  res.json({ data: result });
});

export const revokeSession = asyncHandler(async (req, res) => {
  const result = await service.revokeSession(req.user.id, req.valid.params.sessionId);
  res.json({ data: result });
});
