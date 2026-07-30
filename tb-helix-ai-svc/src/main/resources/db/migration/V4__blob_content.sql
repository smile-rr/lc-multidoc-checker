-- ============================================================================
-- Blob bytes in Postgres — the server-side tier.
--
-- Two tiers, one port, chosen by helix.blob.tier:
--
--   DISK   local development. The tree is browsable, files carry real extensions,
--          and a by-case mirror means inspecting a bundle is opening a file.
--
--   DB     server. Instances share it, nothing depends on a container's writable
--          layer surviving a redeploy, and there is no volume to provision.
--
--   S3     later. The disk layout is already shaped like an object key, so that
--          is a third implementation of the same port and no caller changes.
--
-- Content lives in its own table rather than as a column on `blob`, so the
-- catalogue stays cheap to scan. Listing what a case holds, or sweeping for
-- orphans, must not drag megabytes of bytea through the planner.
-- ============================================================================

CREATE TABLE helix_core.blob_content (
    sha256  CHAR(64) PRIMARY KEY REFERENCES helix_core.blob(sha256) ON DELETE CASCADE,
    -- Postgres will TOAST and compress this out of line automatically. Scanned
    -- documents are already compressed, so we ask it not to waste cycles trying.
    content BYTEA NOT NULL
);

ALTER TABLE helix_core.blob_content ALTER COLUMN content SET STORAGE EXTERNAL;

COMMENT ON TABLE helix_core.blob_content IS
    'Blob bytes for the DB tier. Absent for blobs stored on disk or in object storage — '
    'helix_core.blob.storage_tier says which, and is the only thing that should be consulted.';
