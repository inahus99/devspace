-- Queue storage objects for deletion whenever an attachment row disappears,
-- including rows removed by ON DELETE CASCADE (e.g. deleting a workspace).
CREATE OR REPLACE FUNCTION queue_attachment_storage_deletion() RETURNS trigger AS $$
BEGIN
  INSERT INTO storage_deletions (storage_key) VALUES (OLD.storage_key)
  ON CONFLICT (storage_key) DO NOTHING;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER attachments_queue_storage_deletion
AFTER DELETE ON attachments
FOR EACH ROW EXECUTE FUNCTION queue_attachment_storage_deletion();
--> statement-breakpoint
-- Trigram indexes make the global ILIKE search fast as data grows.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS notes_title_trgm_idx ON notes USING gin (title gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS notes_text_trgm_idx ON notes USING gin (plain_text gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS snippets_title_trgm_idx ON code_snippets USING gin (title gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS resources_title_trgm_idx ON resources USING gin (title gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS dsa_title_trgm_idx ON dsa_problems USING gin (title gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS lld_title_trgm_idx ON lld_exercises USING gin (title gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS books_title_trgm_idx ON books USING gin (title gin_trgm_ops);
