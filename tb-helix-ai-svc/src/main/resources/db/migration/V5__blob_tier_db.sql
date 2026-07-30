-- ============================================================================
-- Admit DB as a storage tier.
--
-- V1 wrote CHECK (storage_tier IN ('DISK','S3')) when disk was the only tier and
-- object storage the only planned one. V4 added the bytes table without widening
-- the constraint, so every write on the DB tier failed at the catalogue.
--
-- Its own migration rather than an edit to V1: V1 has been applied, and rewriting
-- an applied migration means every environment disagrees with its own history.
-- ============================================================================

ALTER TABLE helix_core.blob DROP CONSTRAINT IF EXISTS blob_storage_tier_check;

ALTER TABLE helix_core.blob
    ADD CONSTRAINT blob_storage_tier_check
    CHECK (storage_tier IN ('DISK', 'DB', 'S3'));
