-- Original credit upload (PDF/DOCX/txt bytes), kept so a scanned PDF can be
-- transcribed on the intake thread. credit_text_sha remains the UTF-8 SWIFT
-- dump everything downstream reads — filled at receive for text uploads, or
-- after vision for a scan.
ALTER TABLE helix_check.lc_case
    ADD COLUMN IF NOT EXISTS credit_source_sha CHAR(64);
