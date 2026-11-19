/**
 * REST integration tests. Run with `npm test -w server`.
 *
 * The suite uses an in-memory PGlite database, applies the real migrations, and
 * exercises the API through Express (no listening port required).
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';
process.env.PGLITE_MEMORY = 'true';
process.env.LOG_LEVEL = 'silent';
process.env.JWT_ACCESS_SECRET = 'duoconnect-test-access-secret-123456';
// Keep tests independent of any Cloudinary credentials in a local .env.
process.env.CLOUDINARY_CLOUD_NAME = '';
process.env.CLOUDINARY_API_KEY = '';
process.env.CLOUDINARY_API_SECRET = '';
process.env.VAPID_SUBJECT = '';
process.env.VAPID_PUBLIC_KEY = '';
process.env.VAPID_PRIVATE_KEY = '';

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test, { after, before } from 'node:test';
import supertest from 'supertest';

const { runMigrations } = await import('../src/db/migrate.js');
const { createApp } = await import('../src/app.js');
const { closeDb, query } = await import('../src/db/index.js');

const app = createApp();
const client = supertest(app);

const PASSWORD = 'DuoTest123!';
const suffix = Date.now().toString(36).slice(-5);

function token(result) {
  return result.body.data.accessToken;
}

function cookieFor(result) {
  const raw = result.headers['set-cookie']?.find((entry) => entry.startsWith('dc_refresh='));
  return raw ? raw.split(';')[0] : null;
}

async function register(letter) {
  const username = `t_${suffix}_${letter}`;
  const response = await client.post('/api/auth/register').send({
    email: `${username}@example.test`,
    username,
    displayName: `Test ${letter.toUpperCase()}`,
    password: PASSWORD,
    remember: true,
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return {
    response,
    token: token(response),
    cookie: cookieFor(response),
    user: response.body.data.user,
    username,
    email: `${username}@example.test`,
  };
}

before(async () => {
  await runMigrations({ silent: true });
});

after(async () => {
  await closeDb();
});

test('health endpoint reports the embedded database', async () => {
  const response = await client.get('/api/health');
  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'ok');
  assert.equal(response.body.database, 'pglite-memory');
  assert.equal(response.body.push, false);
  assert.equal(response.body.pushConfig.enabled, false);
  assert.equal(response.body.pushConfig.subjectConfigured, false);
  assert.equal(response.body.pushConfig.publicKeyConfigured, false);
  assert.equal(response.body.pushConfig.privateKeyConfigured, false);
  assert.equal(response.body.pushConfig.error, null);
});

test('auth mutations trust configured and same-origin requests only', async () => {
  const foreign = await client
    .post('/api/auth/refresh')
    .set('Host', 'localhost:5000')
    .set('Origin', 'https://evil.example');
  assert.equal(foreign.status, 403);
  assert.equal(foreign.body.error.code, 'UNTRUSTED_ORIGIN');

  const sameOrigin = await client
    .post('/api/auth/refresh')
    .set('Host', 'localhost:5000')
    .set('Origin', 'http://localhost:5000');
  assert.equal(sameOrigin.status, 200);
  assert.equal(sameOrigin.body.data, null);

  const configured = await client
    .post('/api/auth/refresh')
    .set('Host', 'localhost:5000')
    .set('Origin', 'http://localhost:5173');
  assert.equal(configured.status, 200);
});

test('protected routes reject anonymous callers', async () => {
  const response = await client.get('/api/auth/me');
  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, 'AUTH_REQUIRED');
});

test('registration validates input and never leaks secrets', async () => {
  const invalid = await client.post('/api/auth/register').send({
    email: 'not-an-email',
    username: 'x',
    displayName: '',
    password: 'short',
  });
  assert.equal(invalid.status, 422);
  assert.equal(invalid.body.error.code, 'VALIDATION_ERROR');
  assert.ok(Array.isArray(invalid.body.error.details));

  const a = await register('a');
  assert.equal(a.user.username, a.username);
  assert.equal(JSON.stringify(a.response.body).includes('password'), false);
  assert.equal(JSON.stringify(a.response.body).includes('password_hash'), false);
  assert.ok(a.cookie, 'refresh cookie is set');
});

test('username availability is checked live and case-insensitively', async () => {
  const a = await register('av');

  const available = await client.get('/api/auth/username-available').query({
    username: `brand_new_${suffix}`,
  });
  assert.equal(available.status, 200, JSON.stringify(available.body));
  assert.equal(available.body.data.valid, true);
  assert.equal(available.body.data.available, true);

  // A different case must still report the existing username as taken.
  const taken = await client.get('/api/auth/username-available').query({
    username: a.username.toUpperCase(),
  });
  assert.equal(taken.status, 200, JSON.stringify(taken.body));
  assert.equal(taken.body.data.valid, true);
  assert.equal(taken.body.data.available, false);
  assert.match(taken.body.data.message, /taken/i);

  const invalid = await client.get('/api/auth/username-available').query({ username: 'x' });
  assert.equal(invalid.status, 200, JSON.stringify(invalid.body));
  assert.equal(invalid.body.data.valid, false);
  assert.equal(invalid.body.data.available, false);
});

test('duplicate usernames are rejected at every write path', async () => {
  const a = await register('d1');
  const b = await register('d2');

  // Registration rejects a duplicate (including a case variant).
  const duplicateRegister = await client.post('/api/auth/register').send({
    email: `duplicate_${suffix}@example.test`,
    username: a.username.toUpperCase(),
    displayName: 'Duplicate',
    password: PASSWORD,
  });
  assert.equal(duplicateRegister.status, 409, JSON.stringify(duplicateRegister.body));
  assert.equal(duplicateRegister.body.error.code, 'USERNAME_TAKEN');

  // A profile rename to an existing username is rejected too.
  const duplicateRename = await client
    .patch('/api/users/me')
    .set('Authorization', `Bearer ${b.token}`)
    .send({ username: a.username.toUpperCase() });
  assert.equal(duplicateRename.status, 409, JSON.stringify(duplicateRename.body));
  assert.equal(duplicateRename.body.error.code, 'USERNAME_TAKEN');

  // The DB unique index is the final backstop even if a writer bypasses the
  // service layer entirely (case-insensitively).
  await assert.rejects(
    query(
      `INSERT INTO users (email, username, display_name, password_hash)
       VALUES ($1, $2, $3, $4)`,
      [`bypass_${suffix}@example.test`, a.username.toUpperCase(), 'Bypass', 'hash'],
    ),
    (error) => error.code === '23505',
  );
});

test('session lifecycle: me, refresh rotation, sessions, and logout', async () => {
  const a = await register('s');
  const me = await client.get('/api/auth/me').set('Authorization', `Bearer ${a.token}`);
  assert.equal(me.status, 200);
  assert.equal(me.body.data.user.id, a.user.id);
  assert.ok(me.body.data.settings);

  const anonymousRefresh = await client.post('/api/auth/refresh');
  assert.equal(anonymousRefresh.status, 200);
  assert.equal(anonymousRefresh.body.data, null);

  const refreshed = await client.post('/api/auth/refresh').set('Cookie', a.cookie);
  assert.equal(refreshed.status, 200);
  assert.ok(refreshed.body.data.accessToken);
  const rotatedCookie = cookieFor(refreshed);
  assert.ok(rotatedCookie && rotatedCookie !== a.cookie, 'refresh token rotates');

  const sessions = await client
    .get('/api/auth/sessions')
    .set('Authorization', `Bearer ${refreshed.body.data.accessToken}`)
    .set('Cookie', rotatedCookie);
  assert.equal(sessions.status, 200);
  assert.ok(sessions.body.data.some((session) => session.current === true));

  const logout = await client.post('/api/auth/logout').set('Cookie', rotatedCookie);
  assert.equal(logout.status, 200);

  const afterLogout = await client.post('/api/auth/refresh').set('Cookie', rotatedCookie);
  assert.equal(afterLogout.status, 401);
  assert.equal(afterLogout.body.error.code, 'SESSION_EXPIRED');
});

test('change password verifies the current password and updates the credential', async () => {
  const a = await register('cp');
  const nextPassword = 'Changed456!';

  const wrong = await client
    .post('/api/auth/change-password')
    .set('Authorization', `Bearer ${a.token}`)
    .send({ currentPassword: 'WrongPassword1', newPassword: nextPassword });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.error.details[0].path, 'currentPassword');

  const changed = await client
    .post('/api/auth/change-password')
    .set('Authorization', `Bearer ${a.token}`)
    .send({ currentPassword: PASSWORD, newPassword: nextPassword });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  assert.equal(changed.body.data.success, true);

  const oldLogin = await client
    .post('/api/auth/login')
    .send({ identifier: a.email, password: PASSWORD });
  assert.equal(oldLogin.status, 401);

  const newLogin = await client
    .post('/api/auth/login')
    .send({ identifier: a.email, password: nextPassword });
  assert.equal(newLogin.status, 200, JSON.stringify(newLogin.body));
  assert.ok(newLogin.body.data.accessToken);

  const me = await client.get('/api/auth/me').set('Authorization', `Bearer ${a.token}`);
  assert.equal(me.status, 200);
});

test('profile, settings, search, and public profiles', async () => {
  const a = await register('p');
  const b = await register('q');

  const updated = await client
    .patch('/api/users/me')
    .set('Authorization', `Bearer ${a.token}`)
    .send({ displayName: 'Test Alpha', about: 'Integration test profile.' });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.user.displayName, 'Test Alpha');

  const settings = await client
    .patch('/api/users/me/settings')
    .set('Authorization', `Bearer ${a.token}`)
    .send({
      theme: 'light',
      accent: 'aqua',
      wallpaper: 'mesh',
      notifications: { sounds: false },
      privacy: { readReceipts: false },
    });
  assert.equal(settings.status, 200);
  assert.equal(settings.body.data.theme, 'light');
  assert.equal(settings.body.data.notifications.sounds, false);
  assert.equal(settings.body.data.privacy.readReceipts, false);

  const found = await client
    .get(`/api/users/search?q=${b.username}`)
    .set('Authorization', `Bearer ${a.token}`);
  assert.equal(found.status, 200);
  assert.ok(found.body.data.some((entry) => entry.user.id === b.user.id));

  const profile = await client
    .get(`/api/users/${b.username}`)
    .set('Authorization', `Bearer ${a.token}`);
  assert.equal(profile.status, 200);
  assert.equal(profile.body.data.user.id, b.user.id);
  assert.equal(profile.body.data.relation.isFriend, false);

  const missing = await client
    .get('/api/users/does-not-exist-anywhere')
    .set('Authorization', `Bearer ${a.token}`);
  assert.equal(missing.status, 404);
});

test('friendship, direct chat, messages, receipts, pins, and search', async () => {
  const a = await register('f');
  const b = await register('g');

  const requestResult = await client
    .post('/api/friends/requests')
    .set('Authorization', `Bearer ${a.token}`)
    .send({ userId: b.user.id, message: 'Hello from the test suite.' });
  assert.equal(requestResult.status, 201);
  assert.equal(requestResult.body.data.accepted, false);

  const duplicate = await client
    .post('/api/friends/requests')
    .set('Authorization', `Bearer ${a.token}`)
    .send({ userId: b.user.id });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error.code, 'REQUEST_PENDING');

  const incoming = await client
    .get('/api/friends/requests')
    .set('Authorization', `Bearer ${b.token}`);
  const pending = incoming.body.data.incoming.find((entry) => entry.user.id === a.user.id);
  assert.ok(pending);

  const accepted = await client
    .post(`/api/friends/requests/${pending.id}/accept`)
    .set('Authorization', `Bearer ${b.token}`);
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.data.accepted, true);
  const chatId = accepted.body.data.chatId;
  assert.ok(chatId);

  const friends = await client.get('/api/friends').set('Authorization', `Bearer ${a.token}`);
  assert.ok(friends.body.data.some((entry) => entry.user.id === b.user.id));

  const direct = await client
    .post('/api/chats/direct')
    .set('Authorization', `Bearer ${a.token}`)
    .send({ userId: b.user.id });
  assert.equal(direct.status, 201);
  assert.equal(direct.body.data.id, chatId);

  const chats = await client.get('/api/chats').set('Authorization', `Bearer ${a.token}`);
  assert.ok(chats.body.data.some((chat) => chat.id === chatId));

  const detail = await client.get(`/api/chats/${chatId}`).set('Authorization', `Bearer ${a.token}`);
  assert.equal(detail.body.data.chat.otherUser.id, b.user.id);
  assert.equal(detail.body.data.members.length, 2);

  const sent = await client
    .post(`/api/chats/${chatId}/messages`)
    .set('Authorization', `Bearer ${a.token}`)
    .send({ body: 'A test message about searchable things', clientId: 'test-1' });
  assert.equal(sent.status, 201);
  assert.equal(sent.body.data.type, 'text');
  const messageId = sent.body.data.id;

  const reply = await client
    .post(`/api/chats/${chatId}/messages`)
    .set('Authorization', `Bearer ${b.token}`)
    .send({ body: 'A reply in the thread', replyToId: messageId });
  assert.equal(reply.status, 201);
  assert.equal(reply.body.data.replyTo.id, messageId);

  const edited = await client
    .patch(`/api/messages/${messageId}`)
    .set('Authorization', `Bearer ${a.token}`)
    .send({ body: 'An edited test message about searchable things' });
  assert.equal(edited.status, 200);
  assert.ok(edited.body.data.editedAt);

  const inChatSearch = await client
    .get(`/api/chats/${chatId}/messages/search?q=searchable`)
    .set('Authorization', `Bearer ${b.token}`);
  assert.ok(inChatSearch.body.data.some((message) => message.id === messageId));

  const globalSearch = await client
    .get('/api/messages/search?q=searchable')
    .set('Authorization', `Bearer ${b.token}`);
  assert.ok(globalSearch.body.data.length > 0);

  const pin = await client
    .post(`/api/messages/${messageId}/pin`)
    .set('Authorization', `Bearer ${a.token}`);
  assert.equal(pin.status, 200);
  assert.equal(pin.body.data.pinned, true);

  const pins = await client
    .get(`/api/chats/${chatId}/pins`)
    .set('Authorization', `Bearer ${b.token}`);
  assert.ok(pins.body.data.some((message) => message.id === messageId));

  await client.delete(`/api/messages/${messageId}/pin`).set('Authorization', `Bearer ${a.token}`);

  const forwarded = await client
    .post(`/api/messages/${reply.body.data.id}/forward`)
    .set('Authorization', `Bearer ${a.token}`)
    .send({ chatId });
  assert.equal(forwarded.status, 201);
  assert.notEqual(forwarded.body.data.id, reply.body.data.id);
  assert.equal(forwarded.body.data.body, reply.body.data.body);

  const sticker = await client
    .post(`/api/chats/${chatId}/messages`)
    .set('Authorization', `Bearer ${a.token}`)
    .send({ body: 'heart', type: 'sticker' });
  assert.equal(sticker.status, 201);
  assert.equal(sticker.body.data.type, 'sticker');
  assert.equal(sticker.body.data.body, 'heart');

  const invalidSticker = await client
    .post(`/api/chats/${chatId}/messages`)
    .set('Authorization', `Bearer ${a.token}`)
    .send({ body: 'not-a-sticker', type: 'sticker' });
  assert.equal(invalidSticker.status, 400);

  const forwardedSticker = await client
    .post(`/api/messages/${sticker.body.data.id}/forward`)
    .set('Authorization', `Bearer ${a.token}`)
    .send({ chatId });
  assert.equal(forwardedSticker.status, 201);
  assert.equal(forwardedSticker.body.data.type, 'sticker');
  assert.equal(forwardedSticker.body.data.body, 'heart');

  const gif = await client
    .post(`/api/chats/${chatId}/messages`)
    .set('Authorization', `Bearer ${a.token}`)
    .send({ body: 'wave', type: 'gif' });
  assert.equal(gif.status, 201, JSON.stringify(gif.body));
  assert.equal(gif.body.data.type, 'gif');
  assert.equal(gif.body.data.body, 'wave');

  const invalidGif = await client
    .post(`/api/chats/${chatId}/messages`)
    .set('Authorization', `Bearer ${a.token}`)
    .send({ body: 'not-a-gif', type: 'gif' });
  assert.equal(invalidGif.status, 400);

  const forwardedGif = await client
    .post(`/api/messages/${gif.body.data.id}/forward`)
    .set('Authorization', `Bearer ${a.token}`)
    .send({ chatId });
  assert.equal(forwardedGif.status, 201);
  assert.equal(forwardedGif.body.data.type, 'gif');
  assert.equal(forwardedGif.body.data.body, 'wave');

  const reacted = await client
    .post(`/api/messages/${gif.body.data.id}/reactions`)
    .set('Authorization', `Bearer ${b.token}`)
    .send({ emoji: '👍' });
  assert.equal(reacted.status, 200, JSON.stringify(reacted.body));
  assert.equal(reacted.body.data.reactions.length, 1);
  assert.equal(reacted.body.data.reactions[0].count, 1);
  assert.ok(reacted.body.data.reactions[0].userIds.includes(b.user.id));

  const unreacted = await client
    .post(`/api/messages/${gif.body.data.id}/reactions`)
    .set('Authorization', `Bearer ${b.token}`)
    .send({ emoji: '👍' });
  assert.equal(unreacted.status, 200);
  assert.equal(unreacted.body.data.reactions.length, 0);

  const invalidReaction = await client
    .post(`/api/messages/${gif.body.data.id}/reactions`)
    .set('Authorization', `Bearer ${b.token}`)
    .send({ emoji: 'not an emoji' });
  assert.equal(invalidReaction.status, 400);

  const read = await client
    .post(`/api/chats/${chatId}/read`)
    .set('Authorization', `Bearer ${b.token}`)
    .send({ messageId });
  assert.equal(read.status, 200);

  const history = await client
    .get(`/api/chats/${chatId}/messages`)
    .set('Authorization', `Bearer ${b.token}`);
  assert.ok(Array.isArray(history.body.data.items));
  assert.ok(history.body.data.items.length >= 3);

  const preferences = await client
    .patch(`/api/chats/${chatId}/preferences`)
    .set('Authorization', `Bearer ${a.token}`)
    .send({ muted: true, pinned: true });
  assert.equal(preferences.status, 200);
  assert.equal(preferences.body.data.muted, true);
  assert.equal(preferences.body.data.pinned, true);

  const deleted = await client
    .delete(`/api/messages/${messageId}`)
    .set('Authorization', `Bearer ${a.token}`);
  assert.equal(deleted.status, 200);
  const afterDelete = await client
    .get(`/api/chats/${chatId}/messages`)
    .set('Authorization', `Bearer ${a.token}`);
  const tombstone = afterDelete.body.data.items.find((message) => message.id === messageId);
  assert.ok(tombstone.deletedAt);
  assert.equal(tombstone.body, null);
});

test('link previews require auth and reject unsafe URLs', async () => {
  const a = await register('lp');

  const anonymous = await client.post('/api/links').send({ url: 'https://example.com/page' });
  assert.equal(anonymous.status, 401);

  const invalid = await client
    .post('/api/links')
    .set('Authorization', `Bearer ${a.token}`)
    .send({ url: 'ftp://example.com/file' });
  assert.equal(invalid.status, 400);

  const privateAddress = await client
    .post('/api/links')
    .set('Authorization', `Bearer ${a.token}`)
    .send({ url: 'http://127.0.0.1:5432/admin' });
  assert.equal(privateAddress.status, 400);
});

test('uploads, attachment claiming, notifications, and calls history', async () => {
  const a = await register('u');
  const b = await register('v');

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );
  const upload = await client
    .post('/api/uploads')
    .set('Authorization', `Bearer ${a.token}`)
    .attach('file', png, { filename: 'pixel.png', contentType: 'image/png' });
  assert.equal(upload.status, 201);
  assert.ok(upload.body.data.id);
  assert.ok(upload.body.data.url.startsWith('/uploads/'));

  const direct = await client
    .post('/api/chats/direct')
    .set('Authorization', `Bearer ${a.token}`)
    .send({ userId: b.user.id });
  assert.equal(direct.status, 403);

  const requestResult = await client
    .post('/api/friends/requests')
    .set('Authorization', `Bearer ${a.token}`)
    .send({ userId: b.user.id });
  assert.equal(requestResult.status, 201);
  const incoming = await client
    .get('/api/friends/requests')
    .set('Authorization', `Bearer ${b.token}`);
  const pending = incoming.body.data.incoming.find((entry) => entry.user.id === a.user.id);
  const accepted = await client
    .post(`/api/friends/requests/${pending.id}/accept`)
    .set('Authorization', `Bearer ${b.token}`);
  const chatId = accepted.body.data.chatId;

  const imageMessage = await client
    .post(`/api/chats/${chatId}/messages`)
    .set('Authorization', `Bearer ${a.token}`)
    .send({ body: '', type: 'image', attachmentIds: [upload.body.data.id] });
  assert.equal(imageMessage.status, 201);
  assert.equal(imageMessage.body.data.attachments[0].id, upload.body.data.id);

  // The staged file is now owned by the message; remove it from local disk.
  if (upload.body.data.url.startsWith('/uploads/')) {
    const filePath = path.resolve(
      process.cwd(),
      'uploads',
      upload.body.data.url.replace('/uploads/', ''),
    );
    await fs.rm(filePath, { force: true });
  }

  const notifications = await client
    .get('/api/notifications')
    .set('Authorization', `Bearer ${b.token}`);
  assert.equal(notifications.status, 200);
  assert.ok(notifications.body.data.items.some((item) => item.type === 'friend_request'));

  const summary = await client
    .get('/api/notifications/summary')
    .set('Authorization', `Bearer ${b.token}`);
  assert.equal(summary.status, 200);
  assert.ok(summary.body.data.unread > 0);

  const readAll = await client
    .post('/api/notifications/read-all')
    .set('Authorization', `Bearer ${b.token}`);
  assert.equal(readAll.status, 200);
  const clearedSummary = await client
    .get('/api/notifications/summary')
    .set('Authorization', `Bearer ${b.token}`);
  assert.equal(clearedSummary.body.data.unread, 0);

  const calls = await client.get('/api/calls').set('Authorization', `Bearer ${a.token}`);
  assert.equal(calls.status, 200);
  assert.ok(Array.isArray(calls.body.data));
});

test('message retries with the same clientId are idempotent', async () => {
  const a = await register('ra');
  const b = await register('rb');
  await client
    .post('/api/friends/requests')
    .set('Authorization', `Bearer ${a.token}`)
    .send({ userId: b.user.id });
  const incoming = await client
    .get('/api/friends/requests')
    .set('Authorization', `Bearer ${b.token}`);
  const pending = incoming.body.data.incoming.find((entry) => entry.user.id === a.user.id);
  const accepted = await client
    .post(`/api/friends/requests/${pending.id}/accept`)
    .set('Authorization', `Bearer ${b.token}`);
  const chatId = accepted.body.data.chatId;
  const key = `retry-${Date.now()}`;

  const first = await client
    .post(`/api/chats/${chatId}/messages`)
    .set('Authorization', `Bearer ${a.token}`)
    .send({ body: 'hello', clientId: key });
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.equal(first.body.data.clientId, key);

  const retry = await client
    .post(`/api/chats/${chatId}/messages`)
    .set('Authorization', `Bearer ${a.token}`)
    .send({ body: 'hello', clientId: key });
  assert.equal(retry.status, 201, JSON.stringify(retry.body));
  assert.equal(retry.body.data.id, first.body.data.id);

  const history = await client
    .get(`/api/chats/${chatId}/messages`)
    .set('Authorization', `Bearer ${a.token}`);
  assert.equal(history.status, 200);
  assert.equal(history.body.data.items.filter((item) => item.clientId === key).length, 1);
});

test('push subscription management and active-call lookup', async () => {
  const a = await register('z');

  const key = await client
    .get('/api/notifications/push/public-key')
    .set('Authorization', `Bearer ${a.token}`);
  assert.equal(key.status, 200);
  assert.equal(key.body.data.enabled, false);

  const disabledTest = await client
    .post('/api/notifications/push/test')
    .set('Authorization', `Bearer ${a.token}`);
  assert.equal(disabledTest.status, 400);
  assert.equal(disabledTest.body.error.code, 'PUSH_NOT_CONFIGURED');

  const endpoint = 'https://fcm.googleapis.com/fcm/send/test-subscription';
  const subscription = {
    endpoint,
    keys: { p256dh: 'test-p256dh-key', auth: 'test-auth-secret' },
  };
  const added = await client
    .post('/api/notifications/push/subscribe')
    .set('Authorization', `Bearer ${a.token}`)
    .send(subscription);
  assert.equal(added.status, 200);
  assert.equal(added.body.data.endpoint, endpoint);

  const invalid = await client
    .post('/api/notifications/push/subscribe')
    .set('Authorization', `Bearer ${a.token}`)
    .send({ endpoint: 'not-a-url', keys: subscription.keys });
  assert.equal(invalid.status, 422);

  const active = await client.get('/api/calls/active').set('Authorization', `Bearer ${a.token}`);
  assert.equal(active.status, 200);
  assert.equal(active.body.data, null);

  const removed = await client
    .delete('/api/notifications/push/unsubscribe')
    .set('Authorization', `Bearer ${a.token}`)
    .send({ endpoint });
  assert.equal(removed.status, 200);
  assert.equal(removed.body.data.success, true);

  const removedAgain = await client
    .delete('/api/notifications/push/unsubscribe')
    .set('Authorization', `Bearer ${a.token}`)
    .send({ endpoint });
  assert.equal(removedAgain.body.data.success, false);
});

test('blocking, unblocking, removing friends, and account deletion', async () => {
  const a = await register('w');
  const b = await register('x');

  await client
    .post('/api/friends/requests')
    .set('Authorization', `Bearer ${a.token}`)
    .send({ userId: b.user.id });
  const incoming = await client
    .get('/api/friends/requests')
    .set('Authorization', `Bearer ${b.token}`);
  const pending = incoming.body.data.incoming.find((entry) => entry.user.id === a.user.id);
  await client
    .post(`/api/friends/requests/${pending.id}/accept`)
    .set('Authorization', `Bearer ${b.token}`);

  const block = await client
    .post('/api/friends/block')
    .set('Authorization', `Bearer ${a.token}`)
    .send({ userId: b.user.id });
  assert.equal(block.status, 200);

  const blocked = await client
    .get('/api/friends/blocked')
    .set('Authorization', `Bearer ${a.token}`);
  assert.ok(blocked.body.data.some((entry) => entry.user.id === b.user.id));

  const blockedMessage = await client
    .post('/api/friends/requests')
    .set('Authorization', `Bearer ${b.token}`)
    .send({ userId: a.user.id });
  assert.equal(blockedMessage.status, 403);

  const unblock = await client
    .delete(`/api/friends/block/${b.user.id}`)
    .set('Authorization', `Bearer ${a.token}`);
  assert.equal(unblock.status, 200);

  const remove = await client
    .delete(`/api/friends/${b.user.id}`)
    .set('Authorization', `Bearer ${a.token}`);
  assert.equal(remove.status, 200);

  const friends = await client.get('/api/friends').set('Authorization', `Bearer ${a.token}`);
  assert.equal(
    friends.body.data.some((entry) => entry.user.id === b.user.id),
    false,
  );

  const wrongPassword = await client
    .delete('/api/auth/account')
    .set('Authorization', `Bearer ${a.token}`)
    .send({ password: 'wrong-password' });
  assert.equal(wrongPassword.status, 400);

  const deleted = await client
    .delete('/api/auth/account')
    .set('Authorization', `Bearer ${a.token}`)
    .send({ password: PASSWORD });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.data.success, true);

  const me = await client.get('/api/auth/me').set('Authorization', `Bearer ${a.token}`);
  assert.equal(me.status, 401);
});
