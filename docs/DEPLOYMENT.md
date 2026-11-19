# Deployment

DuoConnect supports two shapes:

1. **Single service (recommended):** Express serves the API, uploads, static assets, and the built React client with SPA fallback.
2. **Split deployment:** static client on a CDN/host, API on a Node host, with CORS and cookies configured for cross-site.

## Option 1 — Docker Compose

The included image builds the client, installs production dependencies, and runs the API.

```bash
JWT_ACCESS_SECRET="$(openssl rand -hex 32)" docker compose up --build
```

Open <http://localhost:5000>. Compose mounts named volumes for the embedded database and uploads.

`docker-compose.yml` requires `JWT_ACCESS_SECRET`; Compose refuses to start without it.

### Environment

```env
NODE_ENV=production
PORT=5000
CLIENT_ORIGIN=https://duoconnect.example.com
DATABASE_URL=postgresql://...        # empty = embedded PGlite
DATABASE_SSL=true
JWT_ACCESS_SECRET=<32+ random bytes>
COOKIE_SAME_SITE=lax                  # none for cross-site + HTTPS
TRUST_PROXY=1
UPLOAD_DIR=uploads
VAPID_SUBJECT=https://duoconnect.example.com
VAPID_PUBLIC_KEY=<public key>
VAPID_PRIVATE_KEY=<private key>
```

Do not run multiple API replicas against one PGlite directory. Use Postgres for any horizontally scaled deployment.

## Option 2 — Node host

```bash
npm ci
npm run build
NODE_ENV=production JWT_ACCESS_SECRET=... npm start
```

The server checks for `client/dist/index.html` at boot. When present it:

- serves hashed `/assets/*` with a one-year immutable cache,
- serves other files from `client/dist`,
- falls back to `index.html` for client-side routes,
- leaves `/api`, `/uploads`, and `/static` untouched.

Recommended hosts: Render, Railway, Fly.io, a VPS, or any Node 20+ runtime with persistent disk (needed for local uploads/PGlite).

## Option 3 — Split client and API

Client:

```bash
VITE_API_URL=https://api.example.com npm run build
```

`VITE_API_URL`, `VITE_ICE_SERVERS`, and `VITE_VAPID_PUBLIC_KEY` are baked into the bundle at build time. Set them in the hosting platform's build environment; editing a local `.env` does not affect deployed builds.

Deploy `client/dist` to Vercel/Netlify/Cloudflare Pages. Add an SPA fallback (`/* → /index.html`) so notification links such as `/app/c/:chatId` load the app instead of 404ing. Vercel configs are included at the repository root and in `client/`.

API:

```env
CLIENT_ORIGIN=https://duoconnect.example.com
COOKIE_SAME_SITE=none
TRUST_PROXY=1                # Secure cookies are set automatically when NODE_ENV=production
```

Requirements for cross-site cookies:

- HTTPS on both origins.
- `SameSite=None; Secure`.
- Exact origin in `CLIENT_ORIGIN` (comma-separated for multiple).

When the API also serves the built client (single-service mode), the request's own origin is trusted automatically, so `CLIENT_ORIGIN` only needs to list additional split-deployment origins. Cross-origin deployments must still list the client origin explicitly.

- `withCredentials` is already enabled by the client.

If the cookie path is `/api/auth`, refresh/logout requests must go to the API origin. The client's Axios base URL handles this via `VITE_API_URL`.

## Database

### Supabase

1. Set `DATABASE_URL` and `DATABASE_SSL=true`.
2. Run `npm run migrate` once (or keep `DB_AUTO_MIGRATE=true`).

The schema is Supabase-compatible. If you expose tables to `supabase-js`, enable RLS; the API itself uses a trusted Postgres role.

### Backups

- Supabase: enable automated backups / PITR in project settings.
- Self-hosted Postgres: use `pg_dump` on a schedule.
- PGlite: back up `server/.data/pglite` while the server is stopped and the directory is copied consistently.

## Uploads

Local disk is the default. On ephemeral hosts (Render, Railway, Fly without volumes, serverless), configure Cloudinary:

```env
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

The storage layer switches automatically and records `provider` per attachment. Mount `UPLOAD_DIR` on a persistent volume if you keep local storage.

## WebRTC / TURN

STUN is enough for local and many home networks. Production needs TURN for restrictive NATs and corporate firewalls.

ICE servers are configured on the **client**, not the API. Set `VITE_ICE_SERVERS` in the client build environment as a JSON array, then rebuild:

```env
VITE_ICE_SERVERS=[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:turn.example.com:3478","username":"...","credential":"..."}]
```

Leave it empty to use the default public STUN servers. Use a hosted TURN service (Twilio Network Traversal, Metered, Cloudflare Calls, Xirsys) or self-host coturn, and prefer `turns:` on 5349 with valid certificates.

Because media is peer-to-peer, bandwidth scales with calls, not with the API. The server only relays signaling.

## Web Push

Web Push lets the app notify users when the tab is closed. It needs a VAPID key pair:

```bash
cd server && npx web-push generate-vapid-keys
```

- Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` on the API. The subject must be a `mailto:` or `https:` URL.
- Set the same public key as `VITE_VAPID_PUBLIC_KEY` in the **client build** environment and rebuild.
- Serve the site over HTTPS. `localhost` is the only HTTP exception.
- The service worker is `client/public/sw.js` and is copied to `/sw.js` in the build. Subscriptions are stored in the `push_subscriptions` table.
- Users opt in from Settings → Notifications. If any VAPID value is missing, the toggle is disabled and the app still shows in-app notifications.

On iOS, Web Push requires the site to be installed to the Home Screen as a PWA (the manifest and icons are included).

## Security checklist

- [ ] Strong `JWT_ACCESS_SECRET`
- [ ] HTTPS everywhere
- [ ] Exact `CLIENT_ORIGIN` allowlist
- [ ] Secure cookies (`lax` same-site or `none` cross-site)
- [ ] `TRUST_PROXY` matches your proxy hops
- [ ] TURN credentials restricted and rotated
- [ ] VAPID private key kept secret; public key matches the client build
- [ ] Upload volume persisted or Cloudinary configured
- [ ] Database backups enabled
- [ ] Rate limits reviewed for expected traffic
- [ ] Logs shipped and `LOG_LEVEL` appropriate
- [ ] Health check wired to `/api/health`

## Health checks

```bash
curl -fsS https://api.example.com/api/health
```

Returns service name, version, database mode, realtime status, uptime, and timestamp. A non-200 or a database mode of `uninitialized` indicates a boot problem.

## Scaling notes

- Socket.IO needs sticky sessions or a WebSocket-aware proxy when running more than one instance.
- Add `@socket.io/redis-adapter`; the domain event bridge is already transport-agnostic.
- Move presence and rate gates to Redis for shared state.
- Use Postgres (Supabase) rather than PGlite for multi-instance deploys.
- Serve the SPA from a CDN to keep API nodes focused on REST/socket traffic.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the scaling path and [SETUP.md](SETUP.md) for variable descriptions.
