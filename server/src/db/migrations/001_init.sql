-- DuoConnect schema — designed for Supabase Postgres (Postgres 15+).
-- All identifiers are UUIDs so the same schema runs on Supabase without changes.

CREATE TABLE IF NOT EXISTS users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL,
  username        text NOT NULL,
  display_name    text NOT NULL,
  password_hash   text NOT NULL,
  avatar_url      text,
  about           text NOT NULL DEFAULT '',
  status          text NOT NULL DEFAULT 'offline'
                    CHECK (status IN ('online', 'away', 'offline')),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users (lower(username));
CREATE INDEX IF NOT EXISTS users_display_name_idx ON users (lower(display_name));
CREATE INDEX IF NOT EXISTS users_status_idx ON users (status) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS user_settings (
  user_id                   uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme                     text NOT NULL DEFAULT 'system'
                              CHECK (theme IN ('light', 'dark', 'system')),
  accent                    text NOT NULL DEFAULT 'violet',
  wallpaper                 text NOT NULL DEFAULT 'aurora',
  message_notifications     boolean NOT NULL DEFAULT true,
  friend_request_notifications boolean NOT NULL DEFAULT true,
  call_notifications        boolean NOT NULL DEFAULT true,
  sound_enabled             boolean NOT NULL DEFAULT true,
  desktop_notifications     boolean NOT NULL DEFAULT false,
  read_receipts             boolean NOT NULL DEFAULT true,
  presence_visibility       text NOT NULL DEFAULT 'friends'
                              CHECK (presence_visibility IN ('everyone', 'friends', 'nobody')),
  last_seen_visibility      text NOT NULL DEFAULT 'friends'
                              CHECK (last_seen_visibility IN ('everyone', 'friends', 'nobody')),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS presence (
  user_id        uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status         text NOT NULL DEFAULT 'offline'
                   CHECK (status IN ('online', 'away', 'offline')),
  socket_count   integer NOT NULL DEFAULT 0,
  last_active_at timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS friendships (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_low   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_high  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT friendships_distinct CHECK (user_low <> user_high),
  CONSTRAINT friendships_order CHECK (user_low < user_high),
  CONSTRAINT friendships_unique UNIQUE (user_low, user_high)
);

CREATE INDEX IF NOT EXISTS friendships_user_low_idx ON friendships (user_low);
CREATE INDEX IF NOT EXISTS friendships_user_high_idx ON friendships (user_high);

CREATE TABLE IF NOT EXISTS friend_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  message      text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CONSTRAINT friend_requests_distinct CHECK (sender_id <> receiver_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS friend_requests_pending_pair
  ON friend_requests (least(sender_id, receiver_id), greatest(sender_id, receiver_id))
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS friend_requests_receiver_idx
  ON friend_requests (receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS friend_requests_sender_idx
  ON friend_requests (sender_id, created_at DESC);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT blocks_distinct CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS blocks_blocked_idx ON blocks (blocked_id);

CREATE TABLE IF NOT EXISTS chats (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text NOT NULL DEFAULT 'direct' CHECK (kind IN ('direct', 'group')),
  name            text,
  avatar_url      text,
  dm_key          text UNIQUE,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chats_last_message_idx ON chats (last_message_at DESC);

CREATE TABLE IF NOT EXISTS chat_members (
  chat_id        uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role           text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at      timestamptz NOT NULL DEFAULT now(),
  last_read_seq  bigint NOT NULL DEFAULT 0,
  is_pinned      boolean NOT NULL DEFAULT false,
  is_muted       boolean NOT NULL DEFAULT false,
  is_archived    boolean NOT NULL DEFAULT false,
  PRIMARY KEY (chat_id, user_id)
);

CREATE INDEX IF NOT EXISTS chat_members_user_idx ON chat_members (user_id);

CREATE TABLE IF NOT EXISTS messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq             bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  chat_id         uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            text NOT NULL DEFAULT 'text'
                    CHECK (type IN ('text', 'image', 'file', 'voice', 'system')),
  body            text,
  reply_to_id     uuid REFERENCES messages(id) ON DELETE SET NULL,
  forwarded_from_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  search_vector   tsvector GENERATED ALWAYS AS
                    (to_tsvector('english', coalesce(body, ''))) STORED,
  edited_at       timestamptz,
  deleted_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_chat_seq_idx ON messages (chat_id, seq DESC);
CREATE INDEX IF NOT EXISTS messages_sender_idx ON messages (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_search_idx ON messages USING GIN (search_vector);

-- Attachments start life unclaimed (message_id is null) when uploaded, then are
-- claimed by the message that references them. This keeps uploaded file
-- metadata authoritative instead of trusting client-supplied URLs.
CREATE TABLE IF NOT EXISTS attachments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id   uuid REFERENCES messages(id) ON DELETE CASCADE,
  uploader_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  url          text NOT NULL,
  public_id    text,
  name         text NOT NULL,
  mime_type    text NOT NULL,
  size_bytes   bigint NOT NULL,
  width        integer,
  height       integer,
  duration_ms  integer,
  provider     text NOT NULL DEFAULT 'local',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attachments_message_idx ON attachments (message_id);
CREATE INDEX IF NOT EXISTS attachments_uploader_idx ON attachments (uploader_id) WHERE message_id IS NULL;

CREATE TABLE IF NOT EXISTS message_receipts (
  message_id   uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delivered_at timestamptz,
  read_at      timestamptz,
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS receipts_unread_idx
  ON message_receipts (user_id, message_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS receipts_undelivered_idx
  ON message_receipts (user_id, message_id) WHERE delivered_at IS NULL;

CREATE TABLE IF NOT EXISTS pinned_messages (
  chat_id    uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  pinned_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, message_id)
);

CREATE TABLE IF NOT EXISTS calls (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id          uuid REFERENCES chats(id) ON DELETE SET NULL,
  caller_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  callee_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN ('audio', 'video')),
  status           text NOT NULL DEFAULT 'ringing'
                     CHECK (status IN ('ringing', 'ongoing', 'completed', 'missed', 'declined', 'cancelled', 'failed')),
  started_at       timestamptz NOT NULL DEFAULT now(),
  answered_at      timestamptz,
  ended_at         timestamptz,
  duration_seconds integer NOT NULL DEFAULT 0,
  end_reason       text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS calls_caller_idx ON calls (caller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS calls_callee_idx ON calls (callee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS calls_active_idx ON calls (callee_id) WHERE status IN ('ringing', 'ongoing');

CREATE TABLE IF NOT EXISTS notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  type       text NOT NULL,
  chat_id    uuid REFERENCES chats(id) ON DELETE CASCADE,
  call_id    uuid REFERENCES calls(id) ON DELETE CASCADE,
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  family_id    uuid NOT NULL,
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  replaced_by  uuid,
  user_agent   text,
  ip           text,
  last_used_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_family_idx ON refresh_tokens (family_id);
