# Roadmap

DuoConnect is feature-complete for a one-to-one communication platform. This roadmap separates what is already shipped from the next meaningful steps.

## Shipped

### Platform

- npm workspace monorepo with shared tooling
- Supabase-compatible Postgres schema plus embedded PGlite fallback
- SQL migrations and embedded PGlite fallback
- Production static serving from Express
- Docker image, Compose stack, GitHub Actions CI
- REST + realtime smoke suites and automated tests

### Accounts and security

- Register/login with email or username
- Access JWT + rotating opaque refresh tokens
- Remember me, refresh reuse detection, session management
- Password change, account deletion, soft deletes
- Trusted-origin checks, rate limits, Helmet, validation everywhere
- Secure avatar and attachment uploads (local or Cloudinary)

### Social

- Profiles with presence, about, last seen, shared context
- Global user search with relationship state
- Friend requests: send, accept, decline, cancel
- Remove friend, block, unblock
- Real-time friend and presence updates

### Chat

- Direct conversations with realtime delivery
- Typing indicators with TTL and rebroadcast throttling
- Delivered/read receipts, per-chat read cursor
- Replies, edits, soft deletes, forwarding
- Pins, in-chat search, global search
- Image/file/voice-note attachments with ownership validation
- Infinite scroll with position preservation and jump-to-message
- Mute, pin chat, unread badges

### Calls

- Audio and video calls over WebRTC
- Perfect negotiation with polite/impolite peers
- Screen share, camera switch, mute, camera toggle
- Call quality and bitrate feedback
- Ringing/accept/decline/cancel/missed/end lifecycles
- Perspective-aware history and notifications

### Experience

- Glassmorphism design system with dark/light themes
- Four accents, four wallpapers, reduced motion
- Responsive desktop/mobile shell
- Animated landing page with live chat story
- Optimistic UI, skeletons, empty states, error handling
- Keyboard shortcut to open search/new chat

## Next

### Near term

- Group conversations (schema already supports `kind = 'group'` and roles)
- Message reactions and emoji picker in the composer (picker dependency is already included)
- Drag-and-drop uploads with progress
- Notification sound preferences per conversation
- Better offline queue with automatic resend

### Platform

- Redis adapter for Socket.IO and shared presence
- Redis-backed rate limiting and presence TTLs
- Object-storage cleanup job for orphaned staged uploads
- Full-text search across attachments (OCR/metadata)
- Structured audit log for security-sensitive actions
- End-to-end encrypted direct chats (key exchange + device verification)

### Calls

- TURN credential service with short-lived secrets
- Call recording (with consent and storage policy)
- Picture-in-picture and background blur
- Bandwidth-adaptive simulcast for video

### Quality

- Playwright end-to-end suite for the browser flows in `TESTING.md`
- Load tests for socket fan-out and message pagination
- Visual regression snapshots for key screens
- Accessibility audit and keyboard-only pass
- Lighthouse budget in CI

## Explicit non-goals

- Public channels or broadcast audiences
- Federation between instances
- A native mobile app in this repository
- Storing call media on the server
