# Architecture

DuoConnect is a two-service application in one npm workspace:

- `client/` — React 19 SPA built with Vite.
- `server/` — Express 5 REST API plus a Socket.IO realtime gateway.

The server can host the built client, so production can run as one container. During development Vite proxies `/api`, `/uploads`, `/static`, and `/socket.io` to the API.

```text
Browser
  ├── React SPA ── Axios ───────────────▶ /api/* ── Express ── service ── repository ── Postgres
  │      │                                  │
  │      └──── Socket.IO (JWT handshake) ──▶ realtime gateway
  │                                             ├── presence registry
  │                                             ├── chat handlers
  │                                             └── call handlers ── WebRTC signaling relay
  │
  └── RTCPeerConnection ◀──── SDP / ICE via server ────▶ RTCPeerConnection (peer)
```

## Backend layers

Each domain under `server/src/modules/` follows the same flow:

```text
routes → controller → service → repository
```

- **Routes** declare paths and attach auth, validation, and rate-limit middleware.
- **Controllers** translate HTTP into service calls and shape responses.
- **Services** own business rules, permissions, transactions, and domain events.
- **Repositories** own SQL. They return mapped, serialized shapes and never import Express.

Shared infrastructure lives in:

- `config/` — validated environment, constants, logger
- `db/` — Postgres/PGlite adapter and migrations
- `middleware/` — JWT auth, validation, uploads, rate limits, errors
- `utils/` — errors, serialization, validation schemas, sanitizers, tokens
- `services/storage.js` — local disk or Cloudinary

### Domain event bridge

Services do not import Socket.IO. They call helpers in `realtime/events.js`:

```js
emitToUsers(memberIds, 'message:new', { ...message, clientId });
```

A single listener in `realtime/index.js` maps these facts to Socket.IO rooms (`user:<id>`). This keeps services unit-testable and makes a Redis pub/sub adapter a drop-in replacement for multi-instance deployments.

## Authentication

DuoConnect uses a two-token design:

1. **Access token** — a short-lived JWT (15 minutes) kept in memory on the client. It is sent as `Authorization: Bearer`.
2. **Refresh token** — 256 bits of random data, set as an `httpOnly`, `SameSite` cookie, and stored only as a SHA-256 hash in `refresh_tokens`.

Properties:

- Refresh tokens rotate on every use; the old record points to its replacement.
- Reuse of a rotated token revokes the entire family (reuse detection).
- Sessions carry user agent, IP, creation, expiry, and last-used metadata, surfaced in Settings.
- “Remember me” extends the refresh lifetime from 30 to 60 days.
- Logout revokes the current token; password change, account deletion, and session revocation invalidate the relevant families.
- Axios refreshes once on `401`, queues concurrent failures behind a single refresh promise, then retries the original request.

Anonymous boot calls `POST /api/auth/refresh`; with no cookie the server returns `data: null`, so public pages load without console errors.

## Realtime gateway

The Socket.IO handshake authenticates the access token, joins `user:<id>`, marks presence, and emits `session:ready` plus a friend presence snapshot. Every inbound event returns an acknowledgement envelope:

```json
{ "ok": true, "data": {} }
{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "…" } }
```

Per-connection rate gates throttle message sends, typing, and call signaling. Typing state is held per socket, expires after five seconds, and rebroadcasts at most every 1.5 seconds. Presence lives in an in-memory socket registry mirrored to the `presence` table; sending `presence:set` away, or hiding the tab, updates friends.

Delivery and read receipts use a monotonic `seq` per message:

- `message:delivered` marks all undelivered receipts for a user.
- Opening or scrolling a chat calls `message:read`, which advances `chat_members.last_read_seq`.
- Senders receive `message:delivered`, `message:read`, and `chat:read` events to update bubble state.

## WebRTC calls

1. The caller emits `call:start` with a chat and kind. The server creates a `calls` row and sends `call:incoming` to the peer's user room.
2. On accept, both sides create an `RTCPeerConnection` with configured ICE servers.
3. The caller is **impolite**; the callee is **polite**. The custom `CallPeer` implements the perfect-negotiation pattern, buffers ICE candidates until a remote description exists, and ignores colliding offers according to politeness.
4. SDP/ICE travel through `call:signal`; media is peer-to-peer and never touches the server.
5. Screen share and camera switching use `RTCRtpSender.replaceTrack`, with `renegotiate` signals when a sender is added.
6. `getStats()` drives connection quality and bitrate feedback.
7. Hangup, decline, cancel, timeout, and connection failure terminate the call with a reason and duration, then write a call notification.

The server only validates participation, sizes signal payloads (200 KB cap), and relays messages between the two authenticated peers.

## Frontend architecture

```text
src/
  lib/        api (Axios + refresh), socket, webrtc, utils, constants
  stores/     auth, ui, presence, friends, notifications, chats, calls
  hooks/      socket bridge, appearance, click-outside, media query
  components/ ui primitives, layout, chat, call, overlays
  pages/      route screens
  styles/     design tokens, global base, wallpapers
```

- **Zustand** holds domain state. The socket bridge is the only place that listens to server events and applies them to stores.
- **React Router 7** provides the route tree, with `RequireAuth` guarding `/app/*`.
- **Theming** is server-driven: the signed-in user's settings set `data-theme`, `data-accent`, and `data-wallpaper` on `<html>`. Anonymous pages default to dark. Reduced motion is persisted locally.
- **Chat** uses an optimistic send with `clientId`, then reconciles with the server message. History pages by cursor with position preservation while scrolling up.
- **Design system** is CSS Modules over global tokens. Shared primitives (`Button`, `TextField`, `Modal`, `Screen`, `Panel`, `Avatar`, `Toggle`, …) keep screens consistent without a component framework.

## Data model

Sixteen tables cover the product. The important relationships:

```text
users 1─1 user_settings
users 1─1 presence
users n─n users        via friendships (ordered pair)
users 1─n friend_requests
users n─n users        via blocks
users n─n chats        via chat_members
chats 1─n messages
messages 1─n attachments
messages 1─n message_receipts
messages n─n chats     via pinned_messages
users 1─n calls
users 1─n notifications
users 1─n refresh_tokens
```

See [SCHEMA.md](SCHEMA.md) for columns, constraints, and indexes.

## Scaling path

The current design runs as a single API instance with Postgres and an in-memory presence registry. To scale horizontally:

1. Add `@socket.io/redis-adapter` and a Redis pub/sub bridge in `realtime/index.js`.
2. Replace the in-memory presence registry with Redis keys and TTL heartbeats.
3. Move rate gates to Redis so limits are shared.
4. Serve uploads from object storage (Cloudinary is already supported).
5. Put the client on a CDN and keep the API behind a load balancer with sticky sessions for Socket.IO.

None of these require changing service-layer code, because domain events are already decoupled from transport.
