-- In-chat games: sessions, moves/strokes history, and game messages.
DO $$
DECLARE
  check_name text;
BEGIN
  FOR check_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.messages'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%type%'
  LOOP
    EXECUTE format('ALTER TABLE public.messages DROP CONSTRAINT %I', check_name);
  END LOOP;
END $$;

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_type_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_type_check
  CHECK (type IN ('text', 'image', 'file', 'voice', 'sticker', 'gif', 'game', 'system'));

CREATE TABLE IF NOT EXISTS game_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id         uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  type            text NOT NULL CHECK (type IN ('tictactoe', 'drawguess')),
  status          text NOT NULL DEFAULT 'invited'
                    CHECK (status IN ('invited', 'active', 'completed', 'declined', 'cancelled', 'expired')),
  inviter_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  winner_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  result          text CHECK (result IN ('win', 'draw', 'declined', 'cancelled', 'expired')),
  state           jsonb NOT NULL DEFAULT '{}'::jsonb,
  invite_message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  started_at      timestamptz,
  ended_at        timestamptz
);

CREATE INDEX IF NOT EXISTS game_sessions_chat_idx ON game_sessions (chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS game_sessions_status_idx ON game_sessions (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS game_sessions_invitee_idx ON game_sessions (invitee_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS game_sessions_players_idx ON game_sessions (inviter_id, invitee_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS game_sessions_one_active_per_chat_idx
  ON game_sessions (chat_id)
  WHERE status IN ('invited', 'active');

CREATE TABLE IF NOT EXISTS game_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id     uuid NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  type        text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS game_events_game_idx ON game_events (game_id, created_at ASC);
