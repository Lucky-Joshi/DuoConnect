# Testing

DuoConnect ships three layers of verification: fast unit tests, API integration tests against a real in-memory Postgres, and live smoke scripts that exercise the running server over HTTP and Socket.IO.

## Commands

```bash
npm test                # Server integration + client unit tests
npm run test:server     # node:test + Supertest
npm run test:client     # Vitest + Testing Library
npm run lint            # ESLint, both workspaces
npm run build           # Production client build
```

Live smoke tests (the API must be running):

```bash
node scripts/smoke-rest.mjs
node scripts/smoke-realtime.mjs
```

## Server integration tests

`server/tests/api.test.js` uses an **in-memory PGlite** database, applies the real SQL migrations, and drives Express through Supertest. No port, external database, or credentials are required.

Coverage:

- health and database mode
- anonymous access rejection
- registration validation and secret leakage
- login/refresh rotation, sessions, logout, token revocation
- profile and settings updates, search, public profiles, 404s
- friend request → accept → friendship
- direct chat creation and sharing restrictions
- message send, reply, edit, search (in-chat and global), pin/unpin, forward
- read receipts, pagination, delete tombstones
- chat preferences
- uploads and attachment claiming
- notifications and read-all
- call history
- blocking, unblocking, friend removal
- account deletion and post-deletion access

The test suite sets:

```js
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';
process.env.PGLITE_MEMORY = 'true';
process.env.LOG_LEVEL = 'silent';
```

Rate limits are skipped in test mode. Upload tests remove their generated files from `server/uploads`.

Run a single file:

```bash
node --test server/tests/api.test.js
```

## Client unit tests

Vitest with jsdom and Testing Library setup (`client/src/test/setup.js`) covers pure logic and browser-adjacent helpers:

- initials, byte/duration formatting, avatar gradients
- message previews for text, media, and tombstones
- attachment type detection
- media URL resolution
- presence labels and link splitting
- WebRTC media error copy and stream cleanup

```bash
npm run test -w client
npm run test:watch -w client
```

## Live REST smoke test

`scripts/smoke-rest.mjs` creates two throwaway accounts, exercises every REST module, and deletes them. It prints `PASS`/`FAIL` per assertion and a final count.

```bash
# terminal 1
npm run dev

# terminal 2
node scripts/smoke-rest.mjs
```

Expected: **47 checks passed**.

## Live realtime smoke test

`scripts/smoke-realtime.mjs` connects two Socket.IO clients and verifies:

- session handshake
- presence propagation
- typing indicators
- message acknowledgement and deduplication
- read receipts
- call start/accept/end
- SDP offer/answer relay

Expected: **12 checks passed**.

## Browser E2E verification

Final QA was run against the production build in Chromium with fake media permissions. These checks complement the committed smoke scripts above:

- two signed-in sessions exchanged a real-time message with typing, reply, edit, pin, search, image attachment, voice note, and delete-tombstone flows — **12/12 checks passed**
- a two-peer call reached `connected` with live audio/video tracks; mute and camera toggles flipped the sender track state, and hangup showed the correct end screen
- screen share switched the remote video to the screen track and restored the camera track after stopping — **passed**
- desktop and mobile reconnaissance found no console errors, no failed HTTP responses, and zero horizontal overflow on mobile

Call checks used Chromium's fake-media flags:

```bash
--use-fake-ui-for-media-stream
--use-fake-device-for-media-stream
--autoplay-policy=no-user-gesture-required
--enable-usermedia-screen-capturing
--auto-select-desktop-capture-source=Entire screen
```

The temporary browser drivers are not committed; `scripts/smoke-rest.mjs` and `scripts/smoke-realtime.mjs` are the repeatable repository-level checks.

## Manual QA checklist

Use two browser profiles with two registered accounts.

### Auth and session

- [ ] Register with an invalid email/username/password shows field errors.
- [ ] Duplicate username/email returns a readable message.
- [ ] Login with username and with email both work.
- [ ] “Remember me” survives a full browser restart; normal sessions survive refresh.
- [ ] Refresh token rotation does not sign you out mid-use.
- [ ] Revoking a session in Settings signs that device out.
- [ ] Password change invalidates previous sessions.
- [ ] Delete account requires the correct password and signs out.

### Social

- [ ] Global user search is debounced and shows relationship state.
- [ ] Sending, accepting, declining, and cancelling requests update both sides.
- [ ] Removing a friend keeps history but blocks new messages.
- [ ] Blocking hides the person and prevents messages/requests.
- [ ] Unblocking restores discoverability.

### Chat

- [ ] New message appears instantly on the other side.
- [ ] Typing indicator appears and expires.
- [ ] Delivered and read ticks update.
- [ ] Replies quote the original and jump to it.
- [ ] Editing shows “edited”.
- [ ] Deleting leaves a tombstone.
- [ ] Pin bar shows pinned messages and unpinning updates live.
- [ ] In-chat search highlights matches and scrolls to them.
- [ ] Infinite scroll preserves reading position.
- [ ] Images preview, files download, voice notes play.
- [ ] Attachment upload validates type and size.
- [ ] Empty/error/loading states render without layout shift.
- [ ] Mobile: list ↔ thread navigation works; composer avoids the keyboard.

### Calls

- [ ] Incoming call UI appears with ringing audio.
- [ ] Accept connects audio; video connects both tracks.
- [ ] Mute, camera off, screen share, and camera switch update the peer.
- [ ] Connection quality changes with network conditions.
- [ ] Decline, cancel, missed, and hangup produce correct history entries.
- [ ] Callback from Calls history works.
- [ ] Settings respect reduced motion and theme during calls.

### Settings and appearance

- [ ] Theme, accent, and wallpaper apply immediately and persist server-side.
- [ ] Avatar upload and removal work (field name `avatar`).
- [ ] Desktop notification permission flow shows an actionable message when denied.
- [ ] Privacy toggles affect presence/last-seen/read receipts for the other user.
- [ ] Hash links from Profile → “Edit profile” scroll to the profile panel.
- [ ] Mobile and desktop layouts have no horizontal overflow.

## CI

`.github/workflows/ci.yml` runs on every push and pull request:

1. `npm ci`
2. `npm run lint`
3. `npm test`
4. `npm run build`

Node 22 is used with npm caching.
