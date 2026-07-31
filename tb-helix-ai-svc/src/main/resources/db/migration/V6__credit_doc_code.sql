-- The credit is one document, whatever is in the file.
--
-- It was filed under `mt700`, which was the truth while an upload could only be an issue.
-- A file may now hold the issue, its continuation and the amendments that followed, so the
-- code names what the document IS — the credit — rather than which message happened to open
-- it. Existing cases move with it; otherwise a case opened before this change would show the
-- old credit alongside a new one after any rerun of intake.

UPDATE helix_check.lc_document SET doc_code = 'LC' WHERE doc_code = 'mt700';
UPDATE helix_check.lc_fact     SET doc_code = 'LC' WHERE doc_code = 'mt700';
UPDATE helix_check.lc_finding  SET doc_code = 'LC' WHERE doc_code = 'mt700';
