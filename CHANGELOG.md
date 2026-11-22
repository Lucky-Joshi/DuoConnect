# Changelog

All notable changes to DuoConnect are documented in this file. Entries are
derived from the repository's git history (newest first within each category).
Commit hashes are included so every change can be traced back to its commit.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Refresh cookies are persistent for every session, and the client restores
  the session from the cookie on startup. Closing and reopening the PWA no
  longer signs users out or flashes the landing/login screens first. (`c9151ae`)

## [1.0.0] - 2026-11-22

### Added

- Google Search Console verification via an HTML file, alongside the existing
  meta-tag verification. (`9a7bc65`)
- Search Console metadata, social preview tags, sitemap, and robots references
  so the public site is discoverable and shareable. (`91a9e4c`, `2ab9e0c`)
- Built-in GIF picker with curated animated reactions, safe markdown formatting,
  emoji reactions, and link preview cards in chat. (`8c6eb3e`)
- Curated sticker sharing in chat, with a picker, rich rendering, previews,
  forwarding, and server-side validation. (`184c2f8`)
- Vercel and Render deployment configuration for split client and API hosting.
  (`93fafd6`)
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

- Simplified the chat composer into one compact input with a single more-options
  menu, and swapped the primary action between voice recording and send.
  (`41712a1`)
- Replaced the MIT license with a commercial/proprietary license. (`21c8d17`)
- Per-file upload limit lowered to 10 MB to match the Cloudinary Free tier;
  aligned across the app, docs, and environment defaults. (`1674474`)
- Authenticated users are sent straight to `/app` instead of the landing page.
  (`024c830`)
- VAPID settings now read from their actual environment variable keys so push
  works in production. (`9b66ba9`)

### Fixed

- Reaction requests no longer double-prefix the API path, so emoji reactions
  save and update in realtime. A regression test guards against the old
  `/api/api/` request. (`41712a1`)
- Conversation details show the peer's avatar instead of the viewer's own photo.
  (`0baaee3`)
- Profile-header avatar presence dot stays circular instead of stretching.
  (`d98e1e2`)
- Push self-test repairs invalid subscriptions and reports the real delivery
  failure instead of a misleading success. (`6fa0ce0`)
- Sign-up reads the wrapped username availability response instead of treating
  available names as taken. (`af8d748`)
- Lighthouse accessibility and SEO findings, including explicit image roles and
  missing robots rules. (`2b39bdc`)
- Screen sharing follows the reference implementation, with robust
  `getDisplayMedia` detection and actionable errors for unsupported, insecure,
  blocked, or cancelled shares. (`7499b55`, `bdd3b71`)
- Cloudinary documentation notes the Console setting required to deliver PDF
  and ZIP files on free plans. (`f5575a4`)
- Vercel SPA fallback so notification deep links resolve instead of 404ing.
  (`a96ba2c`)
- Server tests no longer depend on a developer's local Cloudinary credentials.
  (`a3bd8ec`)
- WebRTC ICE server configuration documented correctly. (`c9f737e`)

### Performance

- Prerendered the public landing page and hydrate it on load, so first paint no
  longer waits for the authenticated app shell. (`1296f16`)
- Self-hosted fonts and reduced landing-page paint work, including lighter
  mobile blur and animation. (`f345eac`)
- Isolated the landing page from the authenticated app shell. (`11d73f4`)
- Lazy-loaded routes so the landing page paints without the full client bundle.
  (`900cc10`)
- Faster call setup with early ICE negotiation and a Web Audio noise gate for
  the microphone. (`7deeca8`)
