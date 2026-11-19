# Database schema

Source of truth: [`server/src/db/migrations/001_init.sql`](../server/src/db/migrations/001_init.sql). The schema targets PostgreSQL 15+ and runs unchanged on Supabase.

All primary keys are UUIDs (`gen_random_uuid()`), timestamps are `timestamptz`, and referential integrity is enforced with explicit `ON DELETE` behavior.

## Entity overview

| Table               | Purpose                                                |
| ------------------- | ------------------------------------------------------ |
| `users`             | Accounts and public profile fields                     |
| `user_settings`     | Theme, notifications, privacy (one row per user)       |
| `presence`          | Current status, socket count, last activity            |
| `friendships`       | Accepted friendships as an ordered unique pair         |
| `friend_requests`   | Pending/answered requests                              |
| `blocks`            | Directional block list                                 |
| `chats`             | Direct (or future group) conversations                 |
| `chat_members`      | Membership, read cursor, pin/mute/archive              |
| `messages`          | Text/media/system messages with edit/delete tombstones |
| `attachments`       | Staged files claimed by messages                       |
| `message_receipts`  | Per-recipient delivered/read timestamps                |
| `message_reactions` | Per-message emoji reactions by user                    |
| `pinned_messages`   | Pins per chat                                          |
| `calls`             | Call history and lifecycle state                       |
| `notifications`     | Activity feed entries                                  |
| `refresh_tokens`    | Hashed rotating refresh tokens with family lineage     |
| `_migrations`       | Applied migration filenames                            |

## users

| Column                     | Type        | Notes                                    |
| -------------------------- | ----------- | ---------------------------------------- |
| `id`                       | uuid PK     |                                          |
| `email`                    | text        | Uniqueness enforced on `lower(email)`    |
| `username`                 | text        | Uniqueness enforced on `lower(username)` |
| `display_name`             | text        |                                          |
| `password_hash`            | text        | bcrypt                                   |
| `avatar_url`               | text        | Optional                                 |
| `about`                    | text        | Default `''`                             |
| `status`                   | text        | `online \| away \| offline`              |
| `last_seen_at`             | timestamptz |                                          |
| `created_at`, `updated_at` | timestamptz |                                          |
| `deleted_at`               | timestamptz | Soft deletion for account removal        |

Indexes: unique lower(email), unique lower(username), lower(display_name), partial status index for live accounts.

## user_settings

One row per user: `theme`, `accent`, `wallpaper`, notification booleans (`message`, `friend request`, `call`, sound, desktop), `read_receipts`, `presence_visibility`, `last_seen_visibility`, `updated_at`.

Theme values are constrained to `light | dark | system`; visibility to `everyone | friends | nobody`. Accent and wallpaper IDs are validated in the API layer and stored as text so new palettes do not require migrations.

## presence

`user_id` PK, `status`, `socket_count`, `last_active_at`, `updated_at`. Mirrors the in-memory socket registry so profile and friend views can render presence after a restart.

## friendships

Stores each pair once:

- `user_low < user_high` (checked constraint)
- `UNIQUE (user_low, user_high)`
- Both foreign keys `ON DELETE CASCADE`

Indexes on both columns support lookups from either side.

## friend_requests

`sender_id`, `receiver_id`, `status` (`pending | accepted | declined | cancelled`), optional `message`, timestamps. A partial unique index on the unordered pair where `status = 'pending'` prevents duplicate open requests. Receiver and sender indexes support inbox/outbox queries.

## blocks

Composite primary key `(blocker_id, blocked_id)`, plus a `blocked_id` index for “who blocked me?” checks. Blocking removes the friendship and makes conversations read-only.

## chats

`id`, `kind` (`direct | group`), optional `name`/`avatar_url`, `created_by`, `last_message_at`, timestamps. `dm_key` is a unique deterministic key for direct chats so the same pair cannot create two DMs. Indexed by `last_message_at` for chat list ordering.

## chat_members

Composite PK `(chat_id, user_id)`; role, `joined_at`, `last_read_seq`, `is_pinned`, `is_muted`, `is_archived`. Indexed by `user_id` for “my chats”. The read cursor is a monotonic bigint aligned with `messages.seq`.

## messages

| Column                             | Notes                                                            |
| ---------------------------------- | ---------------------------------------------------------------- |
| `seq`                              | Generated identity, unique; used for pagination and read cursors |
| `chat_id`, `sender_id`             | Required                                                         |
| `type`                             | `text \| image \| file \| voice \| sticker \| gif \| system`     |
| `body`                             | Nullable for media; curated sticker/GIF id for those types       |
| `reply_to_id`, `forwarded_from_id` | Self-references, `ON DELETE SET NULL`                            |
| `metadata`                         | jsonb for extras                                                 |
| `search_vector`                    | Generated `tsvector` from body                                   |
| `edited_at`, `deleted_at`          | Edit/delete tombstones                                           |
| `created_at`                       |                                                                  |

Indexes: `(chat_id, seq DESC)` for history, `(sender_id, created_at DESC)`, and a GIN index on `search_vector`.

Deletes are soft. The API clears the body and attachments and leaves a tombstone so replies keep context.

## attachments

`message_id` is nullable to support staged uploads. A message claims attachments in the same transaction by setting `message_id`, after verifying the uploader. Other columns: `url`, `public_id`, `name`, `mime_type`, `size_bytes`, dimensions, `duration_ms`, `provider` (`local | cloudinary`).

Indexes: `message_id`; partial index on `uploader_id` where `message_id IS NULL` for cleanup/staging.

## message_receipts

Composite PK `(message_id, user_id)`; `delivered_at`, `read_at`. Partial indexes on undelivered and unread rows keep receipt queries cheap. The app treats `read_at` as authoritative for read receipts and respects the recipient's privacy setting when broadcasting.

## message_reactions

Composite PK `(message_id, user_id, emoji)` lets each person add several distinct emoji to one message while toggling a repeated emoji removes it. `created_at` orders the aggregated `userIds` list. Cascade foreign keys clean up reactions when a message or account is removed; a `message_id` index supports hydration for message pages.

## pinned_messages

Composite PK `(chat_id, message_id)`, `pinned_by`, `created_at`. Unpinning deletes the row.

## calls

`chat_id` (nullable), `caller_id`, `callee_id`, `kind` (`audio | video`), `status` (`ringing | ongoing | completed | missed | declined | cancelled | failed`), `started_at`, `answered_at`, `ended_at`, `duration_seconds`, `end_reason`, `created_at`.

Indexes on caller and callee history; a partial index on active callee calls supports busy detection.

## notifications

`user_id`, nullable `actor_id`, `type`, nullable `chat_id`/`call_id`, jsonb `payload`, `read_at`, `created_at`. Indexed by user and time, plus a partial unread index.

## refresh_tokens

| Column                                    | Notes                                                        |
| ----------------------------------------- | ------------------------------------------------------------ |
| `token_hash`                              | Unique SHA-256 hash; the raw token exists only in the cookie |
| `family_id`                               | Shared by a rotation chain                                   |
| `expires_at`, `revoked_at`, `replaced_by` | Rotation and reuse detection                                 |
| `user_agent`, `ip`, `last_used_at`        | Session management UI                                        |
| `created_at`                              |                                                              |

Indexes on `user_id` and `family_id`.

## Conventions

- Emails and usernames are looked up case-insensitively via functional unique indexes; the API normalizes them to lowercase.
- All message reads use `seq`, never timestamps, to avoid ties.
- Direct chats use `dm_key` (`lowId:highId`) to make creation idempotent.
- Uploaded files are never trusted from client URLs: the client uploads first, then sends attachment IDs.
- Account deletion is soft (`deleted_at`) and the API revokes sessions and anonymizes access paths.

## Supabase notes

- Enable **Row Level Security** on every table if you expose them through Supabase client libraries. This project talks to Postgres directly from the trusted API, so RLS is not required for its own traffic.
- Use the pooled connection string if your host limits direct connections; the `pg` pool is configured with a small test pool and 12 connections otherwise.
- The schema needs no extensions beyond `pgcrypto`/built-ins already present on Supabase (`gen_random_uuid`).
- Run `npm run migrate` before the first boot, or rely on `DB_AUTO_MIGRATE=true`.
