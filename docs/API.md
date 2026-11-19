# API reference

Base URL: `http://localhost:5000` in development. All JSON endpoints live under `/api`.

## Conventions

### Authentication

Protected routes require an access token:

```http
Authorization: Bearer <access-token>
```

Access tokens are short-lived JWTs (15 minutes by default). Refresh tokens are opaque, stored in the `dc_refresh` `httpOnly` cookie, rotated on every refresh, and validated against a hash in Postgres.

### Response envelopes

Successful responses:

```json
{ "data": {} }
```

Errors:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please check the highlighted fields.",
    "details": [{ "path": "email", "message": "Enter a valid email address." }]
  }
}
```

Common codes: `VALIDATION_ERROR` (422), `AUTH_REQUIRED` (401), `SESSION_EXPIRED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `RATE_LIMITED` (429), `INTERNAL_ERROR` (500).

Pagination uses `cursor`/`limit` for messages and returns:

```json
{
  "items": [],
  "nextCursor": 123,
  "hasMore": true
}
```

### Rate limits

| Scope               | Limit                         |
| ------------------- | ----------------------------- |
| Global API          | 400 requests / minute / IP    |
| Auth                | 40 requests / 15 minutes / IP |
| Messages            | 120 / minute / user           |
| Uploads             | 120 / hour / user             |
| Socket messages     | 30 / 10 seconds               |
| Socket call signals | 120 / 10 seconds              |

Limits are disabled under `NODE_ENV=test`.

## Health

| Method | Path          | Auth | Description                                    |
| ------ | ------------- | ---- | ---------------------------------------------- |
| GET    | `/api/health` | No   | Service, database, realtime, uptime, timestamp |

## Auth

| Method | Path                            | Auth   | Description                                                              |
| ------ | ------------------------------- | ------ | ------------------------------------------------------------------------ |
| POST   | `/api/auth/register`            | No     | Create an account and session                                            |
| POST   | `/api/auth/login`               | No     | Sign in with email **or** username                                       |
| POST   | `/api/auth/refresh`             | Cookie | Rotate the refresh token; returns `data: null` when no cookie is present |
| POST   | `/api/auth/logout`              | Cookie | Revoke the current refresh token                                         |
| GET    | `/api/auth/me`                  | Yes    | Current user + settings                                                  |
| PATCH  | `/api/auth/change-password`     | Yes    | `{ currentPassword, newPassword }`                                       |
| DELETE | `/api/auth/account`             | Yes    | `{ password }` — soft-deletes the account                                |
| GET    | `/api/auth/sessions`            | Yes    | Refresh-token sessions for this account                                  |
| DELETE | `/api/auth/sessions/:sessionId` | Yes    | Revoke one session                                                       |

Register body:

```json
{
  "email": "you@example.com",
  "username": "yourname",
  "displayName": "Your Name",
  "password": "Example123!",
  "remember": true
}
```

Login body:

```json
{ "identifier": "yourname", "password": "Example123!", "remember": true }
```

Session response shape:

```json
{
  "user": { "id": "...", "username": "yourname", "displayName": "Your Name", "avatarUrl": "..." },
  "settings": { "theme": "dark", "accent": "violet", "wallpaper": "aurora" },
  "accessToken": "…",
  "refreshMaxAge": 5184000000
}
```

## Users

| Method | Path                     | Auth | Description                                             |
| ------ | ------------------------ | ---- | ------------------------------------------------------- |
| GET    | `/api/users/search?q=`   | Yes  | Search people by username or display name               |
| PATCH  | `/api/users/me`          | Yes  | Update `displayName`, `username`, `about`, `avatarUrl`  |
| PATCH  | `/api/users/me/settings` | Yes  | Update theme, accent, wallpaper, notifications, privacy |
| GET    | `/api/users/:username`   | Yes  | Public profile plus viewer relationship                 |

Profile response:

```json
{
  "user": {
    "id": "...",
    "username": "yourfriend",
    "displayName": "Your Friend",
    "status": "online"
  },
  "relation": {
    "isFriend": true,
    "request": null,
    "blockedByMe": false,
    "blockedMe": false,
    "friendsSince": "2026-08-14T10:00:00.000Z"
  }
}
```

Settings body accepts any subset:

```json
{
  "theme": "dark",
  "accent": "aqua",
  "wallpaper": "mesh",
  "notifications": { "messages": true, "sounds": false, "desktop": true },
  "privacy": { "readReceipts": true, "presence": "friends", "lastSeen": "friends" }
}
```

Themes: `light | dark | system`. Accents: `violet | aqua | coral | amber | rose`. Wallpapers: `aurora | mesh | dusk | minimal`.

## Friends

| Method | Path                                       | Auth | Description                                 |
| ------ | ------------------------------------------ | ---- | ------------------------------------------- |
| GET    | `/api/friends`                             | Yes  | Accepted friendships                        |
| GET    | `/api/friends/requests`                    | Yes  | `{ incoming, outgoing }`                    |
| POST   | `/api/friends/requests`                    | Yes  | `{ userId, message? }`                      |
| POST   | `/api/friends/requests/:requestId/accept`  | Yes  | Accept; creates the direct chat             |
| POST   | `/api/friends/requests/:requestId/decline` | Yes  | Decline                                     |
| DELETE | `/api/friends/requests/:requestId`         | Yes  | Cancel an outgoing request                  |
| GET    | `/api/friends/blocked`                     | Yes  | Blocked users                               |
| POST   | `/api/friends/block`                       | Yes  | `{ userId }` — also removes friendship      |
| DELETE | `/api/friends/block/:userId`               | Yes  | Unblock                                     |
| DELETE | `/api/friends/:friendId`                   | Yes  | Remove a friend (history becomes read-only) |

Accepting a request returns `{ accepted: true, chatId }`. Duplicate pending requests return `409 REQUEST_PENDING`.

## Chats

| Method | Path                                    | Auth | Description                                     |
| ------ | --------------------------------------- | ---- | ----------------------------------------------- |
| GET    | `/api/chats`                            | Yes  | Chat list with last message, unread count, peer |
| POST   | `/api/chats/direct`                     | Yes  | `{ userId }` — requires friendship              |
| GET    | `/api/chats/:chatId`                    | Yes  | Chat, peer, members, preferences                |
| PATCH  | `/api/chats/:chatId/preferences`        | Yes  | `{ pinned?, muted? }`                           |
| GET    | `/api/chats/:chatId/messages`           | Yes  | Cursor pagination; `cursor`, `around`, `limit`  |
| POST   | `/api/chats/:chatId/messages`           | Yes  | Send a message                                  |
| POST   | `/api/chats/:chatId/read`               | Yes  | `{ messageId? , uptoSeq? }`                     |
| GET    | `/api/chats/:chatId/messages/search?q=` | Yes  | Search inside a chat                            |
| GET    | `/api/chats/:chatId/pins`               | Yes  | Pinned messages                                 |

Send body:

```json
{
  "body": "See you at 4?",
  "type": "text",
  "replyToId": "uuid-or-null",
  "attachmentIds": ["uuid"],
  "clientId": "optimistic-id"
}
```

Types: `text | image | file | voice`. Attachments must first be uploaded and are claimed atomically by the message. `clientId` is echoed back so optimistic UI can reconcile.

## Messages

| Method | Path                               | Auth | Description                             |
| ------ | ---------------------------------- | ---- | --------------------------------------- |
| GET    | `/api/messages/search?q=`          | Yes  | Global search across the caller's chats |
| PATCH  | `/api/messages/:messageId`         | Yes  | Edit body; sender only                  |
| DELETE | `/api/messages/:messageId`         | Yes  | Soft-delete/tombstone; sender only      |
| POST   | `/api/messages/:messageId/pin`     | Yes  | Pin in its chat                         |
| DELETE | `/api/messages/:messageId/pin`     | Yes  | Unpin                                   |
| POST   | `/api/messages/:messageId/forward` | Yes  | `{ chatId }`                            |

## Uploads

| Method | Path                  | Auth | Description                                                |
| ------ | --------------------- | ---- | ---------------------------------------------------------- |
| POST   | `/api/uploads`        | Yes  | `multipart/form-data`, field `file`; optional `durationMs` |
| POST   | `/api/uploads/avatar` | Yes  | `multipart/form-data`, field `avatar`; images only         |

Uploads return a staged attachment `{ id, url, name, mimeType, sizeBytes, provider }`. Avatars return `{ url, publicId, provider }`; save it with `PATCH /api/users/me` (`avatarUrl`).

Limits: 15 MB default (`MAX_UPLOAD_MB`), 5 MB avatars, 10 attachments per message. Local disk by default; Cloudinary when configured.

## Notifications

| Method | Path                                | Auth | Description                  |
| ------ | ----------------------------------- | ---- | ---------------------------- |
| GET    | `/api/notifications?filter=&limit=` | Yes  | `{ items, unread }`          |
| GET    | `/api/notifications/summary`        | Yes  | `{ unread }`                 |
| POST   | `/api/notifications/read-all`       | Yes  | Mark every notification read |
| DELETE | `/api/notifications/read`           | Yes  | Clear read notifications     |
| POST   | `/api/notifications/:id/read`       | Yes  | Mark one read                |
| DELETE | `/api/notifications/:id`            | Yes  | Remove one                   |

### Web Push subscriptions

| Method | Path                                  | Auth | Description                   |
| ------ | ------------------------------------- | ---- | ----------------------------- |
| GET    | `/api/notifications/push/public-key`  | Yes  | `{ publicKey, enabled }`      |
| POST   | `/api/notifications/push/subscribe`   | Yes  | Register `{ endpoint, keys }` |
| DELETE | `/api/notifications/push/unsubscribe` | Yes  | Remove `{ endpoint }`         |

## Calls

| Method | Path                 | Auth | Description                             |
| ------ | -------------------- | ---- | --------------------------------------- |
| GET    | `/api/calls?limit=`  | Yes  | Perspective-aware call history          |
| GET    | `/api/calls/active`  | Yes  | A call still ringing for you, or `null` |
| GET    | `/api/calls/:callId` | Yes  | One call visible to a participant       |

Calls begin and end over Socket.IO; these endpoints are read-only history.

## Realtime API

Connect with the access token:

```js
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: { token: accessToken },
  withCredentials: true,
});
```

Every client → server event accepts an optional acknowledgement:

```js
socket.emit('message:send', payload, (reply) => {
  if (reply.ok) console.log(reply.data);
  else console.error(reply.error.code, reply.error.message);
});
```

### Client → server

| Event               | Payload                                                      | Result                               |
| ------------------- | ------------------------------------------------------------ | ------------------------------------ |
| `message:send`      | `{ chatId, body, type, replyToId, attachmentIds, clientId }` | Hydrated message                     |
| `message:read`      | `{ chatId, messageId?, uptoSeq? }`                           | Advanced read cursor                 |
| `message:delivered` | none                                                         | Marks undelivered messages delivered |
| `typing:start`      | `{ chatId }`                                                 | Broadcast typing state               |
| `typing:stop`       | `{ chatId }`                                                 | Clears typing state                  |
| `call:start`        | `{ chatId, kind }`                                           | Created call                         |
| `call:accept`       | `{ callId }`                                                 | Accepted call                        |
| `call:reject`       | `{ callId }`                                                 | Declined call                        |
| `call:cancel`       | `{ callId }`                                                 | Cancelled call                       |
| `call:end`          | `{ callId, reason }`                                         | Ended call                           |
| `call:fail`         | `{ callId, reason }`                                         | Failed call                          |
| `call:signal`       | `{ callId, type, data }`                                     | Relayed to the peer                  |
| `presence:set`      | `{ status }`                                                 | Updates presence                     |

`call:signal.type` is one of `offer`, `answer`, `ice`, `renegotiate`, `media`, `quality`. Media never touches the server; only SDP/ICE/state is relayed.

### Server → client

`session:ready`, `session:error`, `presence:snapshot`, `presence:update`, `typing:update`, `message:new`, `message:updated`, `message:deleted`, `message:delivered`, `message:read`, `chat:read`, `message:pinned`, `notification:new`, `notification:read`, `notification:removed`, `friend:accepted`, `friend:removed`, `contact:blocked`, `contact:unblocked`, `call:incoming`, `call:accepted`, `call:signal`, `call:declined`, `call:cancelled`, `call:missed`, `call:ended`.

## Quick examples

```bash
# Health
curl http://localhost:5000/api/health

# Login and capture the token
curl -s -X POST http://localhost:5000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"identifier":"yourname","password":"Example123!","remember":true}'

# List chats
curl http://localhost:5000/api/chats \
  -H "authorization: Bearer $TOKEN"
```
