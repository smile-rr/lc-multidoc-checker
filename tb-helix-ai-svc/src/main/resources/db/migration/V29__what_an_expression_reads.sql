-- SQL cannot parse an expression, and the catalogue's views are built on the assumption that
-- it can read a condition.
--
-- `v_check_list` derives four things by walking `$.rule.groups[*]` with jsonb_path_query: the
-- tier, which documents the operands name, whether there are any conditions at all, and
-- whether the check could run before anything is read. An expression has no groups and no
-- rows, so every one of those derivations returns nothing for it: the console would draw an
-- expression check as "no conditions", and it could never be a threshold check however
-- carefully it was written.
--
-- STORING A DERIVED VALUE IS WHAT THIS SCHEMA NORMALLY REFUSES, and the reason is worth
-- stating rather than assumed. The alternative is the console asserting what its own rule
-- reads — which is the assertion this schema has always refused, because an assertion that
-- disagrees with the rule is a lie the run has to resolve, and it resolves it by not running
-- the check. This is not that: it is rebuilt wholesale from the compiler on every save, by
-- the same code that refuses to save an expression which does not compile, and it is never
-- edited by hand. A row here that disagrees with its check is a bug in one place, not a
-- disagreement between two authors.

CREATE TABLE helix_gov.check_facet (
    check_id  TEXT        PRIMARY KEY,
    -- 'TREE' | 'EXPRESSION'. A tree needs no row here; one exists only where SQL cannot see
    -- the condition for itself.
    language  TEXT        NOT NULL,
    -- Whether any comparison it makes is a reading rather than a comparison — the expression
    -- language's answer to the same question `has_judgement_op` asks of a tree's operators.
    judgement BOOLEAN     NOT NULL DEFAULT FALSE,
    -- [{"doc": "BOL", "field": "on_board_date"}, ...] — what the tree's operand walk produces
    -- for a tree, produced by the compiler for an expression.
    reads     JSONB       NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE helix_gov.check_facet IS
    'What SQL cannot read off a check whose condition is an expression. Rebuilt from the '
    'compiler on every save; never authored.';

CREATE INDEX ix_check_facet_reads ON helix_gov.check_facet USING GIN (reads jsonb_path_ops);
