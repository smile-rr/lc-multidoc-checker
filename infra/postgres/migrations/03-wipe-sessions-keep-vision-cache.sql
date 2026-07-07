-- Wipe all officer-paced session data after pipeline stage id rename.
-- Preserves lc_v3.vision_extract_cache (cross-session VLM parse cache).
--
-- Run: make db-sessions-clean

DELETE FROM lc_v3.pipeline_events;

TRUNCATE lc_v3.check_sessions CASCADE;
