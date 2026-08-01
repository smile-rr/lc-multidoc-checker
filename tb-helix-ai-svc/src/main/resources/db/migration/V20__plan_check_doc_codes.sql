-- ----------------------------------------------------------------------------
-- Which documents a planned check actually looks at.
--
-- The plan screen has a column for this and had to guess at it: for an exact rule
-- it printed the whole operand expression — `expiry_date @ LC d_lte
-- presentation_date @ CS` — which is honest and unreadable down twenty-three rows,
-- and for a judged one it had nothing at all and printed the credit's tag numbers.
--
-- Every kind of check knows the answer at the moment it is planned: a dictionary
-- card declares its doc types, a compiled condition names them in its operands, and
-- a requirement read out of :46A: names them because the planner was given the
-- vocabulary. Derived at assembly time it would only be recoverable for the exact
-- ones, so it is written down once, where it is known.
--
-- Empty means the check reads the presentation as a whole rather than any named
-- document, which is a real answer and not a missing one.
-- ----------------------------------------------------------------------------

ALTER TABLE helix_check.lc_plan_check
    ADD COLUMN doc_codes TEXT[] NOT NULL DEFAULT '{}';
