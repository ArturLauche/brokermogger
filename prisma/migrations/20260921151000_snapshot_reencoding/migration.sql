-- Permit one-way representation migration, preserving every immutable field
-- and proving that the legacy text matches its original content hash.
CREATE OR REPLACE FUNCTION brokermogger_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'RequestSnapshot'
       AND coalesce(current_setting('brokermogger.reencode_snapshot', true), 'off') = 'on' THEN
      IF OLD."payloadEnc" IS NULL AND NEW."payloadEnc" IS NOT NULL
         AND NEW.subject = '' AND NEW.body = ''
         AND OLD."contentHash" = encode(sha256(convert_to(OLD.subject || E'\n' || OLD.body, 'UTF8')), 'hex')
         AND (to_jsonb(OLD) - ARRAY['subject', 'body', 'payloadEnc', 'updatedAt'])
             = (to_jsonb(NEW) - ARRAY['subject', 'body', 'payloadEnc', 'updatedAt']) THEN
        RETURN NEW;
      END IF;
    END IF;
    RAISE EXCEPTION 'Table % is append-only: UPDATE is not allowed', TG_TABLE_NAME USING ERRCODE = '0A000';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF coalesce(current_setting('brokermogger.allow_append_only_delete', true), 'off') <> 'on' THEN
      RAISE EXCEPTION 'Table % is append-only: DELETE requires the retention escape hatch', TG_TABLE_NAME USING ERRCODE = '0A000';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
