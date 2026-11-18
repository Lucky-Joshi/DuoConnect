# Setup

## Prerequisites

- Node.js **20.19+** (22 LTS recommended)
- npm 10+
- Optional: PostgreSQL 15+ or a Supabase project
- Optional: Docker for the container workflow

No external database is required for local development. With an empty `DATABASE_URL`, DuoConnect uses an embedded PGlite Postgres database on disk.

## Install

```bash
npm install
cp server/.env.example server/.env   # optional in development
npm run dev
```

| Service | URL                                |
| ------- | ---------------------------------- |
| Client  | <http://localhost:5173>            |
| API     | <http://localhost:5000>            |
| Health  | <http://localhost:5000/api/health> |

On first start the server applies migrations and creates an empty database. Register two accounts (in two browser profiles) to test presence, typing, delivery/read receipts, and calls.

## Environment

The server reads `server/.env` (and `process.env`). Every value has a safe development default.

### Core

| Variable        | Default                 | Notes                                                                                                             |
| --------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`      | `development`           | `production` enables secure cookies when appropriate and long asset caching                                       |
| `PORT`          | `5000`                  | API port                                                                                                          |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Comma-separated allowlist of browser origins. The server's own origin is always trusted for same-origin requests. |
| `TRUST_PROXY`   | `1`                     | Express proxy trust; set `0` if not behind a proxy                                                                |
| `LOG_LEVEL`     | `info`                  | Pino level (`silent` in tests)                                                                                    |

### Database

| Variable          | Default        | Notes                                                                       |
| ----------------- | -------------- | --------------------------------------------------------------------------- |
| `DATABASE_URL`    | empty          | Leave empty for PGlite. Use a Supabase/Postgres connection string otherwise |
| `DATABASE_SSL`    | –              | Defaults to on for remote hosts; disable for local Postgres                 |
| `DB_AUTO_MIGRATE` | `true`         | Apply migrations on boot                                                    |
| `PGLITE_DATA_DIR` | `.data/pglite` | Relative to `server/`                                                       |
| `PGLITE_MEMORY`   | –              | `true` for an in-memory database (tests)                                    |

### Auth

| Variable                 | Default         | Notes                                                                  |
| ------------------------ | --------------- | ---------------------------------------------------------------------- |
| `JWT_ACCESS_SECRET`      | dev-only string | **Change in production.** At least 16 characters; use 32+ random bytes |
| `ACCESS_TOKEN_TTL`       | `15m`           | JWT lifetime                                                           |
| `REFRESH_TOKEN_TTL_DAYS` | `30`            | Normal session                                                         |
| `REMEMBER_ME_TTL_DAYS`   | `60`            | “Remember me” session                                                  |
| `COOKIE_NAME`            | `dc_refresh`    | Refresh cookie name                                                    |
| `COOKIE_DOMAIN`          | empty           | Set for a shared parent domain                                         |
| `COOKIE_SAME_SITE`       | `lax`           | Use `none` + HTTPS for cross-site deployments                          |

### Uploads

| Variable                | Default      | Notes                              |
| ----------------------- | ------------ | ---------------------------------- |
| `UPLOAD_DIR`            | `uploads`    | Relative to `server/`              |
| `MAX_UPLOAD_MB`         | `15`         | Per file                           |
| `CLOUDINARY_CLOUD_NAME` | empty        | Set all three to enable Cloudinary |
| `CLOUDINARY_API_KEY`    | empty        |                                    |
| `CLOUDINARY_API_SECRET` | empty        |                                    |
| `CLOUDINARY_FOLDER`     | `duoconnect` | Remote folder                      |

If Cloudinary is not configured, files are stored on disk and served from `/uploads`.

### WebRTC

```env
ICE_SERVERS=[{"urls":"stun:stun.l.google.com:19302"},{"urls":"stun:stun1.l.google.com:19302"}]
```

Public STUN is enough for local testing and most home networks. Add a TURN entry for production:

```json
[
  { "urls": "stun:stun.l.google.com:19302" },
  {
    "urls": ["turn:turn.example.com:3478", "turns:turn.example.com:5349"],
    "username": "duo",
    "credential": "secret"
  }
]
```

## Client environment

The client uses the Vite proxy in development, so no environment file is needed. For a split deployment:

```env
VITE_API_URL=https://api.example.com
```

Leave it empty for same-origin deploys where Express serves `client/dist`.

## Supabase

1. Create a project at <https://supabase.com>.
2. Copy the **connection string** from Project Settings → Database.
3. Set it in `server/.env`:

```env
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres
DATABASE_SSL=true
```

4. Apply the schema and start the app:

```bash
npm run migrate
npm run dev
```

The schema uses `gen_random_uuid()`, timestamptz, `tsvector`, partial indexes, and standard Postgres constraints — no extensions beyond what Supabase enables by default.

> The API connects with a direct Postgres role. If you expose these tables to Supabase client libraries, enable Row Level Security and write policies appropriate to your app. The reference app does not use `supabase-js`; all access goes through the API.

## Useful commands

```bash
npm run dev                 # API + client
npm run dev:server          # API with watch
npm run dev:client          # Vite only
npm run migrate             # Apply migrations
npm test                    # Server integration + client unit tests
npm run lint                # Both workspaces
npm run build               # Client production build
npm start                   # API, serving client/dist when present
```

## Resetting local data

Stop the running server, then:

```bash
rm -rf server/.data server/uploads     # PowerShell: Remove-Item -Recurse -Force server/.data,server/uploads
npm run dev
```

`server/.data` and `server/uploads` are gitignored. The database and uploads will be recreated empty.

## Troubleshooting

**Port already in use.** Stop the process using 5000 or 5173, or set `PORT`/Vite `server.port`.

**PGlite lock or “database is locked”.** Only one process can open the embedded database directory. Stop watch processes before starting another server.

**Avatars or attachments return 404.** Confirm the server is running and `UPLOAD_DIR`/`server/public/static` exist. Express serves `/uploads` and `/static`; the Vite dev server proxies both.

**Cookies are not set cross-site.** Use HTTPS and `COOKIE_SAME_SITE=none`; also set `CLIENT_ORIGIN` to the exact client origin and ensure `VITE_API_URL` points at the API.

**Camera or microphone blocked.** Browsers require a secure context. `localhost` is allowed; remote HTTP is not. Check site permissions and that another app is not holding the device.

**Calls connect on LAN but not across networks.** Add a TURN server to `ICE_SERVERS`. STUN alone cannot traverse symmetric NATs.

**Uploads fail on serverless hosts.** Local disk is ephemeral. Configure Cloudinary or mount persistent storage.
