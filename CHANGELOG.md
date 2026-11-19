# Changelog

All notable changes to DuoConnect are documented in this file. Entries are
derived from the repository's git history (newest first within each category).
Commit hashes are included so every change can be traced back to its commit.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
No version tags have been published yet, so everything to date is listed under
`Unreleased`.

## [Unreleased]

### Added

- Live username availability feedback during sign-up, with a debounced
  case-insensitive check and inline Available/Taken status. (`4bfe542`)
- Automatic resend of unsent messages via a local outbox, with server-side
  idempotency so retries cannot duplicate messages. (`5c4cf53`)
- Web push notifications for messages and calls, including subscription
  management, deep links, a self-test, and install guidance. (`e673dc7`,
  `449575d`)
- Push configuration diagnostics in the health check, plus a public push status
  endpoint for the client. (`41eb1d7`, `75592ec`)
- React client experience: chat, presence, friends, calls, settings, and the
  responsive UI shell. (`d832109`)
- Node/Express server: REST API, Socket.IO realtime gateway, WebRTC signaling,
  and the Postgres/PGlite data layer. (`0e33845`)
- REST and realtime smoke test suites. (`da28d75`)
- Setup, API, architecture, and QA documentation. (`6805370`)
- GitHub Actions CI workflow. (`447671b`)
- Supabase agent skills for the repository. (`391eb56`)
- Initial workspace layout and deployment configuration. (`c4effdd`)

### Changed

- Per-file upload limit lowered to 10 MB to match the Cloudinary Free tier;
  aligned across the app, docs, and environment defaults. (`1674474`)
- VAPID settings now read from their actual environment variable keys so push
  works in production. (`9b66ba9`)
- Authenticated users are sent straight to `/app` instead of the landing page.
  (`024c830`)

### Fixed

- Screen sharing no longer reports "browser not supported" when a working or
  prefixed `getDisplayMedia` API is present; insecure contexts and blocked or
  cancelled shares now give actionable messages. (`bdd3b71`)
- Username uniqueness is enforced at every write path — registration, profile
  rename, and the database unique index — returning a clear conflict instead of
  allowing duplicates. (`4bfe542`)
- Vercel SPA fallback so notification deep links resolve instead of 404ing.
  (`a96ba2c`)
- Server tests no longer depend on a developer's local Cloudinary credentials.
  (`a3bd8ec`)
- WebRTC ICE server configuration documented correctly. (`c9f737e`)
- Cloudinary documentation notes the Console setting required to deliver PDF
  and ZIP files on free plans. (`f5575a4`)

### Performance

- Faster call setup with early ICE negotiation and a Web Audio noise gate for
  the microphone. (`7deeca8`)
