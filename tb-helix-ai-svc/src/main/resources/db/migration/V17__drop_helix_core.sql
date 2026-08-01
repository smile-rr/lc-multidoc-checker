-- helix_core is gone.
--
-- V12 moved every application table into helix_infra and left this schema holding
-- only flyway_schema_history — Flyway could not relocate the table that records the
-- migration that would move it. That history now lives in helix_infra (relocated
-- before migrate by FlywayConfig), so the empty husk can go.
--
-- Idempotent: FlywayConfig may already have dropped it on this boot; a fresh
-- database that still ran V1's CREATE SCHEMA leaves an empty helix_core for us.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'helix_core')
       AND NOT EXISTS (
           SELECT 1 FROM information_schema.tables WHERE table_schema = 'helix_core'
       ) THEN
        EXECUTE 'DROP SCHEMA helix_core';
    END IF;
END $$;
