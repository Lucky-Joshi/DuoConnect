-- Built-in GIFs are messages whose body holds a curated GIF id.
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
  CHECK (type IN ('text', 'image', 'file', 'voice', 'sticker', 'gif', 'system'));
