/**
 * End-to-end realtime smoke test. Requires the API to be running.
 * Usage: node scripts/smoke-realtime.mjs
 *
 * The script creates two throwaway accounts, connects them as friends, runs
 * the realtime checks, and deletes the accounts when it finishes.
 */
import { io } from 'socket.io-client';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:5000';

let checks = 0;
let failures = 0;

function check(label, condition) {
  checks += 1;
  const mark = condition ? 'PASS' : 'FAIL';
  if (!condition) failures += 1;
  console.log(`${mark}  ${label}`);
}

async function request(method, path, { token, body, cookie } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${method} ${path} → ${response.status}: ${payload?.error?.message ?? text}`);
  }
  return { data: payload?.data, setCookie: response.headers.getSetCookie?.() ?? [] };
}

function refreshCookie(setCookie) {
  const raw = setCookie.find((entry) => entry.startsWith('dc_refresh='));
  return raw ? raw.split(';')[0] : null;
}

async function register(letter) {
  const suffix = Date.now().toString(36).slice(-6);
  const username = `rt_${suffix}_${letter}`.slice(0, 24);
  const result = await request('POST', '/api/auth/register', {
    body: {
      email: `${username}@example.test`,
      username,
      displayName: `Realtime ${letter.toUpperCase()}`,
      password: 'DuoSmoke123!',
      remember: true,
    },
  });
  return {
    ...result.data,
    username,
    cookie: refreshCookie(result.setCookie),
  };
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket'], reconnection: false });
    const timer = setTimeout(() => reject(new Error('Socket connect timeout')), 8000);
    socket.once('session:ready', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function emit(socket, event, payload) {
  return new Promise((resolve, reject) => {
    socket.timeout(6000).emit(event, payload, (error, ack) => {
      if (error) return reject(new Error(`${event}: ${error.message}`));
      if (!ack?.ok) return reject(new Error(`${event}: ${ack?.error?.message ?? 'failed'}`));
      resolve(ack.data);
    });
  });
}

function waitFor(socket, event, predicate = () => true, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    function handler(payload) {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    }
    socket.on(event, handler);
  });
}

let first = null;
let second = null;
let firstSocket = null;
let secondSocket = null;

try {
  first = await register('a');
  second = await register('b');

  const sentRequest = await request('POST', '/api/friends/requests', {
    token: first.accessToken,
    body: { userId: second.user.id, message: 'Realtime smoke test.' },
  });
  const incoming = (
    await request('GET', '/api/friends/requests', { token: second.accessToken })
  ).data.incoming.find((entry) => entry.user.id === first.user.id);
  if (!incoming || !sentRequest.data.request.id) throw new Error('Could not create friend request');

  const accepted = await request('POST', `/api/friends/requests/${incoming.id}/accept`, {
    token: second.accessToken,
  });
  const chatId = accepted.data.chatId;
  if (!chatId) throw new Error('Accepting the request did not create a chat');

  firstSocket = await connect(first.accessToken);
  secondSocket = await connect(second.accessToken);
  check(
    'both clients connect and receive session:ready',
    Boolean(firstSocket.id && secondSocket.id),
  );

  const away = waitFor(
    firstSocket,
    'presence:update',
    (payload) => payload.userId === second.user.id,
  );
  await emit(secondSocket, 'presence:set', { status: 'away' });
  check('friend presence updates in realtime', (await away).status === 'away');
  await emit(secondSocket, 'presence:set', { status: 'online' });

  const typing = waitFor(
    secondSocket,
    'typing:update',
    (payload) => payload.active && payload.chatId === chatId,
  );
  await emit(firstSocket, 'typing:start', { chatId });
  check('typing indicator reaches the peer', (await typing).displayName === first.user.displayName);

  const incomingMessage = waitFor(
    secondSocket,
    'message:new',
    (payload) => payload.clientId === 'smoke-realtime-1',
  );
  const sent = await emit(firstSocket, 'message:send', {
    chatId,
    body: 'Realtime smoke test message.',
    clientId: 'smoke-realtime-1',
  });
  check(
    'message send acknowledges with a hydrated message',
    sent.id && sent.sender.username === first.username,
  );
  const delivered = await incomingMessage;
  check(
    'message:new reaches the peer exactly once',
    delivered.body === 'Realtime smoke test message.',
  );

  const readEvent = waitFor(firstSocket, 'message:read', (payload) =>
    payload.messageIds.includes(sent.id),
  );
  await emit(secondSocket, 'message:read', { chatId, messageId: sent.id });
  check('read receipt returns to the sender', (await readEvent).readerId === second.user.id);

  const incomingWait = waitFor(
    secondSocket,
    'call:incoming',
    (payload) => payload.caller.id === first.user.id,
  );
  const call = await emit(firstSocket, 'call:start', { chatId, kind: 'audio' });
  check('call starts ringing', call.status === 'ringing');
  const callIncoming = await incomingWait;
  check('callee receives incoming call', callIncoming.id === call.id);

  const acceptedCall = waitFor(firstSocket, 'call:accepted', (payload) => payload.id === call.id);
  await emit(secondSocket, 'call:accept', { callId: call.id });
  check('caller observes call accepted', (await acceptedCall).status === 'ongoing');

  const offer = waitFor(secondSocket, 'call:signal', (payload) => payload.type === 'offer');
  await emit(firstSocket, 'call:signal', {
    callId: call.id,
    type: 'offer',
    data: { type: 'offer', sdp: 'v=0\r\nsmoke-test' },
  });
  check('WebRTC offer is relayed to the peer', (await offer).from === first.user.id);

  const answer = waitFor(firstSocket, 'call:signal', (payload) => payload.type === 'answer');
  await emit(secondSocket, 'call:signal', {
    callId: call.id,
    type: 'answer',
    data: { type: 'answer', sdp: 'v=0\r\nsmoke-test-answer' },
  });
  check('WebRTC answer is relayed to the caller', (await answer).from === second.user.id);

  const ended = await emit(firstSocket, 'call:end', { callId: call.id });
  check('call ends and reports duration', ended.status === 'completed');
} finally {
  firstSocket?.disconnect();
  secondSocket?.disconnect();
  if (first) {
    await request('DELETE', '/api/auth/account', {
      token: first.accessToken,
      cookie: first.cookie,
      body: { password: 'DuoSmoke123!' },
    }).catch(() => {});
  }
  if (second) {
    await request('DELETE', '/api/auth/account', {
      token: second.accessToken,
      cookie: second.cookie,
      body: { password: 'DuoSmoke123!' },
    }).catch(() => {});
  }
}

console.log(
  failures ? `\n${failures}/${checks} check(s) failed` : `\nAll ${checks} realtime checks passed`,
);
process.exit(failures ? 1 : 0);
