/**
 * End-to-end REST smoke test. Requires the API to be running.
 * Usage: node scripts/smoke-rest.mjs
 *
 * The script creates two throwaway accounts, exercises every REST module, and
 * deletes the accounts when it finishes so the database stays tidy.
 */
const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:5000';

let failures = 0;
let checks = 0;

function check(label, condition) {
  checks += 1;
  const mark = condition ? 'PASS' : 'FAIL';
  if (!condition) failures += 1;
  console.log(`${mark}  ${label}`);
}

async function request(method, path, { token, body, form, cookie } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  const setCookie = response.headers.getSetCookie?.() ?? [];

  if (!response.ok) {
    const error = new Error(
      `${method} ${path} → ${response.status}: ${payload?.error?.message ?? text}`,
    );
    error.status = response.status;
    error.code = payload?.error?.code;
    error.body = payload;
    throw error;
  }
  return { data: payload?.data, setCookie, status: response.status };
}

async function expectFailure(label, promise, expectedStatus, expectedCode) {
  try {
    await promise;
    check(label, false);
  } catch (error) {
    const statusOk = error.status === expectedStatus;
    const codeOk = expectedCode ? error.code === expectedCode : true;
    if (!statusOk || !codeOk) {
      console.log(
        `      expected ${expectedStatus}${expectedCode ? ` ${expectedCode}` : ''}, got ${error.status} ${error.code}: ${error.message}`,
      );
    }
    check(label, statusOk && codeOk);
  }
}

function refreshCookie(setCookie) {
  const raw = setCookie.find((entry) => entry.startsWith('dc_refresh='));
  return raw ? raw.split(';')[0] : null;
}

async function register(suffix, letter) {
  const username = `smoke_${suffix}_${letter}`.slice(0, 24);
  const result = await request('POST', '/api/auth/register', {
    body: {
      email: `${username}@example.test`,
      username,
      displayName: `Smoke ${letter.toUpperCase()}`,
      password: 'DuoSmoke123!',
      remember: true,
    },
  });
  return {
    ...result.data,
    username,
    email: `${username}@example.test`,
    cookie: refreshCookie(result.setCookie),
  };
}

const suffix = Date.now().toString(36).slice(-5);
let userA = await register(suffix, 'a');
let userB = await register(suffix, 'b');
check('register returns an access token and user', Boolean(userA.accessToken && userA.user.id));
check(
  'register never leaks password hashes',
  JSON.stringify(userA.user).includes('password') === false,
);
check('register sets an httpOnly refresh cookie', Boolean(userA.cookie));

// --- Session and profile ---------------------------------------------------
const me = (await request('GET', '/api/auth/me', { token: userA.accessToken })).data;
check(
  'GET /auth/me returns the profile and settings',
  me.user.id === userA.user.id && Boolean(me.settings),
);

const updatedProfile = (
  await request('PATCH', '/api/users/me', {
    token: userA.accessToken,
    body: { displayName: 'Smoke Alpha', about: 'Testing the REST surface.' },
  })
).data;
check('PATCH /users/me updates the profile', updatedProfile.user.displayName === 'Smoke Alpha');

const updatedSettings = (
  await request('PATCH', '/api/users/me/settings', {
    token: userA.accessToken,
    body: { theme: 'light', accent: 'aqua', notifications: { sounds: false } },
  })
).data;
check(
  'PATCH /users/me/settings persists preferences',
  updatedSettings.theme === 'light' &&
    updatedSettings.accent === 'aqua' &&
    updatedSettings.notifications.sounds === false,
);

const profile = (await request('GET', `/api/users/${userB.username}`, { token: userA.accessToken }))
  .data;
check('GET /users/:username returns a public profile', profile.user.username === userB.username);
check(
  'profile reports no existing relationship',
  profile.relation.isFriend === false && profile.relation.request === null,
);

const found = (
  await request('GET', `/api/users/search?q=${userB.username}`, { token: userA.accessToken })
).data;
check(
  'user search finds the new account',
  found.some((entry) => entry.user.id === userB.user.id),
);

// --- Friends ---------------------------------------------------------------
const sentRequest = (
  await request('POST', '/api/friends/requests', {
    token: userA.accessToken,
    body: { userId: userB.user.id, message: 'Hello from the smoke test.' },
  })
).data;
check(
  'friend request is created as pending',
  sentRequest.accepted === false && Boolean(sentRequest.request.id),
);

const requestsForB = (await request('GET', '/api/friends/requests', { token: userB.accessToken }))
  .data;
const incoming = requestsForB.incoming.find((entry) => entry.user.id === userA.user.id);
check('recipient sees the incoming request', Boolean(incoming));

await expectFailure(
  'duplicate friend request is rejected',
  request('POST', '/api/friends/requests', {
    token: userA.accessToken,
    body: { userId: userB.user.id },
  }),
  409,
  'REQUEST_PENDING',
);

const accepted = (
  await request('POST', `/api/friends/requests/${incoming.id}/accept`, { token: userB.accessToken })
).data;
check(
  'accepting a request creates a direct chat',
  accepted.accepted === true && Boolean(accepted.chatId),
);

const friendsOfA = (await request('GET', '/api/friends', { token: userA.accessToken })).data;
check(
  'friend list contains the new friend',
  friendsOfA.some((entry) => entry.user.id === userB.user.id),
);

// --- Chats and messages ----------------------------------------------------
const direct = (
  await request('POST', '/api/chats/direct', {
    token: userA.accessToken,
    body: { userId: userB.user.id },
  })
).data;
check('POST /chats/direct reuses the friendship chat', direct.id === accepted.chatId);

const chatList = (await request('GET', '/api/chats', { token: userA.accessToken })).data;
check(
  'chat list includes the direct conversation',
  chatList.some((chat) => chat.id === direct.id),
);

const chatDetail = (await request('GET', `/api/chats/${direct.id}`, { token: userA.accessToken }))
  .data;
check(
  'chat detail resolves the peer',
  chatDetail.chat.otherUser?.id === userB.user.id && chatDetail.members.length === 2,
);

const sent = (
  await request('POST', `/api/chats/${direct.id}/messages`, {
    token: userA.accessToken,
    body: { body: 'First REST smoke message', clientId: 'rest-1' },
  })
).data;
check(
  'text message is stored and hydrated',
  sent.body === 'First REST smoke message' && sent.type === 'text',
);

const reply = (
  await request('POST', `/api/chats/${direct.id}/messages`, {
    token: userB.accessToken,
    body: { body: 'Replying to the smoke message', replyToId: sent.id },
  })
).data;
check('reply references the original message', reply.replyTo?.id === sent.id);

const edited = (
  await request('PATCH', `/api/messages/${sent.id}`, {
    token: userA.accessToken,
    body: { body: 'First REST smoke message (edited)' },
  })
).data;
check(
  'message edit marks the message edited',
  edited.body.endsWith('(edited)') && Boolean(edited.editedAt),
);

const searchInChat = (
  await request('GET', `/api/chats/${direct.id}/messages/search?q=smoke`, {
    token: userA.accessToken,
  })
).data;
check(
  'in-chat search finds matching messages',
  searchInChat.some((message) => message.id === sent.id),
);

const globalSearch = (
  await request('GET', '/api/messages/search?q=smoke', { token: userB.accessToken })
).data;
check('global search finds conversations', Array.isArray(globalSearch) && globalSearch.length > 0);

const pinned = (await request('POST', `/api/messages/${sent.id}/pin`, { token: userA.accessToken }))
  .data;
check('pin returns the pinned message', pinned.pinned === true);
const pinnedList = (
  await request('GET', `/api/chats/${direct.id}/pins`, { token: userB.accessToken })
).data;
check(
  'pinned list contains the message',
  pinnedList.some((message) => message.id === sent.id),
);
await request('DELETE', `/api/messages/${sent.id}/pin`, { token: userA.accessToken });
const pinnedAfter = (
  await request('GET', `/api/chats/${direct.id}/pins`, { token: userB.accessToken })
).data;
check(
  'unpin removes it from the pinned list',
  pinnedAfter.every((message) => message.id !== sent.id),
);

const forwarded = (
  await request('POST', `/api/messages/${reply.id}/forward`, {
    token: userA.accessToken,
    body: { chatId: direct.id },
  })
).data;
check(
  'forward creates a new message in the target chat',
  forwarded.id !== reply.id && forwarded.body === reply.body,
);

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const form = new FormData();
form.append('file', new Blob([png], { type: 'image/png' }), 'pixel.png');
const attachment = (await request('POST', '/api/uploads', { token: userA.accessToken, form })).data;
check(
  'file upload returns an unclaimed attachment',
  Boolean(attachment.id) && attachment.url.startsWith('/uploads/'),
);

const imageMessage = (
  await request('POST', `/api/chats/${direct.id}/messages`, {
    token: userA.accessToken,
    body: { body: '', type: 'image', attachmentIds: [attachment.id] },
  })
).data;
check(
  'attachment is claimed by the message',
  imageMessage.type === 'image' && imageMessage.attachments[0]?.id === attachment.id,
);

const messages = (
  await request('GET', `/api/chats/${direct.id}/messages`, { token: userB.accessToken })
).data;
check(
  'message history is paginated with items',
  Array.isArray(messages.items) && messages.items.length >= 4,
);

const read = (
  await request('POST', `/api/chats/${direct.id}/read`, {
    token: userB.accessToken,
    body: { messageId: imageMessage.id },
  })
).data;
check('read endpoint advances the read cursor', Boolean(read.lastReadSeq) || read.unread === 0);

const deleted = (await request('DELETE', `/api/messages/${sent.id}`, { token: userA.accessToken }))
  .data;
const historyAfterDelete = (
  await request('GET', `/api/chats/${direct.id}/messages`, { token: userA.accessToken })
).data;
const tombstone = historyAfterDelete.items.find((message) => message.id === sent.id);
check(
  'delete leaves a tombstone in history',
  deleted.success === true && Boolean(tombstone?.deletedAt) && tombstone.body === null,
);

const preferences = (
  await request('PATCH', `/api/chats/${direct.id}/preferences`, {
    token: userA.accessToken,
    body: { muted: true, pinned: true },
  })
).data;
check(
  'chat preferences persist mute and pin',
  preferences.muted === true && preferences.pinned === true,
);

// --- Notifications ---------------------------------------------------------
const notifications = (await request('GET', '/api/notifications', { token: userB.accessToken }))
  .data;
check(
  'friend request produced a notification',
  notifications.items.some((item) => item.type === 'friend_request'),
);
const summary = (await request('GET', '/api/notifications/summary', { token: userB.accessToken }))
  .data;
check('notification summary reports unread count', typeof summary.unread === 'number');
await request('POST', '/api/notifications/read-all', { token: userB.accessToken });
const readSummary = (
  await request('GET', '/api/notifications/summary', { token: userB.accessToken })
).data;
check('read-all clears unread notifications', readSummary.unread === 0);

// --- Calls -----------------------------------------------------------------
const calls = (await request('GET', '/api/calls', { token: userA.accessToken })).data;
check('call history endpoint responds with a list', Array.isArray(calls));

// --- Sessions and refresh tokens ------------------------------------------
const refreshed = await request('POST', '/api/auth/refresh', { cookie: userA.cookie });
check('refresh rotates the access token', Boolean(refreshed.data.accessToken));
const newCookie = refreshCookie(refreshed.setCookie);
check('refresh rotates the refresh cookie', Boolean(newCookie) && newCookie !== userA.cookie);
userA.tokenBeforeRefresh = userA.accessToken;
userA.accessToken = refreshed.data.accessToken;
userA.cookie = newCookie;

const sessions = (
  await request('GET', '/api/auth/sessions', { token: userA.accessToken, cookie: userA.cookie })
).data;
check(
  'session list includes the current device',
  sessions.some((session) => session.current === true),
);

// --- Blocking and friendship removal --------------------------------------
await request('POST', '/api/friends/block', {
  token: userA.accessToken,
  body: { userId: userB.user.id },
});
const blocked = (await request('GET', '/api/friends/blocked', { token: userA.accessToken })).data;
check(
  'block list contains the blocked user',
  blocked.some((entry) => entry.user.id === userB.user.id),
);
await expectFailure(
  'blocked users can no longer send messages',
  request('POST', `/api/chats/${direct.id}/messages`, {
    token: userB.accessToken,
    body: { body: 'Should not arrive' },
  }),
  403,
  'CHAT_READ_ONLY',
);
await request('DELETE', `/api/friends/block/${userB.user.id}`, { token: userA.accessToken });
const blockedAfter = (await request('GET', '/api/friends/blocked', { token: userA.accessToken }))
  .data;
check(
  'unblock clears the block list',
  blockedAfter.every((entry) => entry.user.id !== userB.user.id),
);
await expectFailure(
  'removed friends become read-only',
  request('POST', `/api/chats/${direct.id}/messages`, {
    token: userA.accessToken,
    body: { body: 'Should not arrive either' },
  }),
  403,
  'CHAT_READ_ONLY',
);

// --- Password change and account deletion ---------------------------------
await request('POST', '/api/auth/change-password', {
  token: userB.accessToken,
  cookie: userB.cookie,
  body: { currentPassword: 'DuoSmoke123!', newPassword: 'DuoSmoke456!' },
});
await expectFailure(
  'old password stops working after change',
  request('POST', '/api/auth/login', {
    body: { identifier: userB.username, password: 'DuoSmoke123!' },
  }),
  401,
);
const relogin = await request('POST', '/api/auth/login', {
  body: { identifier: userB.username, password: 'DuoSmoke456!' },
});
check('new password works after change', Boolean(relogin.data.accessToken));
userB.accessToken = relogin.data.accessToken;
userB.cookie = refreshCookie(relogin.setCookie);

await request('DELETE', '/api/auth/account', {
  token: userA.accessToken,
  cookie: userA.cookie,
  body: { password: 'DuoSmoke123!' },
});
await expectFailure(
  'deleted account can no longer log in',
  request('POST', '/api/auth/login', {
    body: { identifier: userA.username, password: 'DuoSmoke123!' },
  }),
  401,
);
await request('DELETE', '/api/auth/account', {
  token: userB.accessToken,
  cookie: userB.cookie,
  body: { password: 'DuoSmoke456!' },
});
check('password change, account deletion, and refresh flows complete', true);

console.log(
  failures ? `\n${failures}/${checks} check(s) failed` : `\nAll ${checks} REST checks passed`,
);
process.exit(failures ? 1 : 0);
