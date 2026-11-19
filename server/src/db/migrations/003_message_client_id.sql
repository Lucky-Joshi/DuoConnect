-- Client-generated idempotency key for message sends. A retried send after a
-- lost acknowledgement must return the original message instead of inserting
-- a duplicate.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_id text;

CREATE UNIQUE INDEX IF NOT EXISTS messages_sender_client_idx
  ON messages (sender_id, client_id)
  WHERE client_id IS NOT NULL;
