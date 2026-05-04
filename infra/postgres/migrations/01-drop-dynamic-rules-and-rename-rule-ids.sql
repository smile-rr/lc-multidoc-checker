-- ============================================================================
-- Migration 01 — drop dynamic_rules table; rename pre-redesign rule IDs to
-- topic-prefix scheme (CCY · AMT · DATE · PARTY · GOODS · SHIP · DOC · COND).
--
-- Idempotent: re-running is a no-op (dictionary handles unknown values via
-- the ELSE branch, DROP TABLE IF EXISTS is safe to re-execute).
-- ============================================================================

BEGIN;

-- ── 1. Drop the runtime-rules cache table ──────────────────────────────────
DROP TABLE IF EXISTS lc_v2.dynamic_rules;

-- Refresh v_examine_meta if it still references adhoc_rules. Dropping and
-- recreating is safer than ALTER VIEW because the column count differs.
DROP VIEW IF EXISTS lc_v2.v_examine_meta;
CREATE VIEW lc_v2.v_examine_meta AS
SELECT  session_id,
        result->'consistency_warnings'     AS consistency_warnings,
        result->'consistency'              AS consistency,
        result->'trigger_traces'           AS trigger_traces
FROM    lc_v2.pipeline_steps
WHERE   stage = 'examine' AND step_key = 'meta';

-- ── 2. Rename rule IDs across pipeline_steps (examine stage) ──────────────
-- Mapping (old → new):
--   INV-001 / OP05-BENEFICIARY-CONSISTENT  → PARTY-02  (cross-doc beneficiary)
--   INV-001 (legacy "issued by beneficiary") → PARTY-01
--   INV-003 / OP01-CURRENCY-CONSISTENT     → CCY-01
--   INV-005 / OP02-AMOUNT-WITHIN-LC        → AMT-01
--   INV-006 / OP06-GOODS-DESCRIPTION-CORRESPONDS → GOODS-01
--   BOL-003 / OP07-BL-ONBOARD-VALID        → SHIP-01
--   BOL-005                                → SHIP-02
--   BOL-007 / OP09-46A-DOC-SET-COMPLETE    → DOC-01
--   BOL-009 / OP08-BL-CLEAN                → DOC-02
--   PKL-003 / XD-004                       → GOODS-02
--   PKL-004                                → GOODS-03
--   BOE-001                                → PARTY-03
--   BOE-003                                → AMT-02
--   BC-001  / OP10-BC-WC-46A-COMPLIANCE (BC)→ COND-01
--   BC-003                                 → DOC-03
--   WC-001                                 → COND-02
--   GEN-001                                → DOC-04
--   GEN-003 / OP03-DOC-DATE-VALID          → DATE-01
--   OP04-PRESENTATION-WINDOW               → DATE-02
--   XD-022                                 → PARTY-02
--   XD-024                                 → SHIP-03
UPDATE lc_v2.pipeline_steps
SET    step_key = CASE step_key
    WHEN 'INV-001' THEN 'PARTY-01'
    WHEN 'INV-003' THEN 'CCY-01'
    WHEN 'INV-005' THEN 'AMT-01'
    WHEN 'INV-006' THEN 'GOODS-01'
    WHEN 'BOL-003' THEN 'SHIP-01'
    WHEN 'BOL-005' THEN 'SHIP-02'
    WHEN 'BOL-007' THEN 'DOC-01'
    WHEN 'BOL-009' THEN 'DOC-02'
    WHEN 'PKL-003' THEN 'GOODS-02'
    WHEN 'PKL-004' THEN 'GOODS-03'
    WHEN 'BOE-001' THEN 'PARTY-03'
    WHEN 'BOE-003' THEN 'AMT-02'
    WHEN 'BC-001'  THEN 'COND-01'
    WHEN 'BC-003'  THEN 'DOC-03'
    WHEN 'WC-001'  THEN 'COND-02'
    WHEN 'GEN-001' THEN 'DOC-04'
    WHEN 'GEN-003' THEN 'DATE-01'
    WHEN 'XD-004'  THEN 'GOODS-02'
    WHEN 'XD-022'  THEN 'PARTY-02'
    WHEN 'XD-024'  THEN 'SHIP-03'
    WHEN 'OP01-CURRENCY-CONSISTENT'           THEN 'CCY-01'
    WHEN 'OP02-AMOUNT-WITHIN-LC'              THEN 'AMT-01'
    WHEN 'OP03-DOC-DATE-VALID'                THEN 'DATE-01'
    WHEN 'OP04-PRESENTATION-WINDOW'           THEN 'DATE-02'
    WHEN 'OP05-BENEFICIARY-CONSISTENT'        THEN 'PARTY-02'
    WHEN 'OP06-GOODS-DESCRIPTION-CORRESPONDS' THEN 'GOODS-01'
    WHEN 'OP07-BL-ONBOARD-VALID'              THEN 'SHIP-01'
    WHEN 'OP08-BL-CLEAN'                      THEN 'DOC-02'
    WHEN 'OP09-46A-DOC-SET-COMPLETE'          THEN 'DOC-01'
    WHEN 'OP10-BC-WC-46A-COMPLIANCE'          THEN 'COND-01'
    ELSE step_key
END
WHERE  stage = 'examine'
  AND  step_key <> 'meta';

-- ── 3. Rename rule IDs in officer_actions (rule-related actions) ──────────
UPDATE lc_v2.officer_actions
SET    target = CASE target
    WHEN 'INV-001' THEN 'PARTY-01'
    WHEN 'INV-003' THEN 'CCY-01'
    WHEN 'INV-005' THEN 'AMT-01'
    WHEN 'INV-006' THEN 'GOODS-01'
    WHEN 'BOL-003' THEN 'SHIP-01'
    WHEN 'BOL-005' THEN 'SHIP-02'
    WHEN 'BOL-007' THEN 'DOC-01'
    WHEN 'BOL-009' THEN 'DOC-02'
    WHEN 'PKL-003' THEN 'GOODS-02'
    WHEN 'PKL-004' THEN 'GOODS-03'
    WHEN 'BOE-001' THEN 'PARTY-03'
    WHEN 'BOE-003' THEN 'AMT-02'
    WHEN 'BC-001'  THEN 'COND-01'
    WHEN 'BC-003'  THEN 'DOC-03'
    WHEN 'WC-001'  THEN 'COND-02'
    WHEN 'GEN-001' THEN 'DOC-04'
    WHEN 'GEN-003' THEN 'DATE-01'
    WHEN 'XD-004'  THEN 'GOODS-02'
    WHEN 'XD-022'  THEN 'PARTY-02'
    WHEN 'XD-024'  THEN 'SHIP-03'
    WHEN 'OP01-CURRENCY-CONSISTENT'           THEN 'CCY-01'
    WHEN 'OP02-AMOUNT-WITHIN-LC'              THEN 'AMT-01'
    WHEN 'OP03-DOC-DATE-VALID'                THEN 'DATE-01'
    WHEN 'OP04-PRESENTATION-WINDOW'           THEN 'DATE-02'
    WHEN 'OP05-BENEFICIARY-CONSISTENT'        THEN 'PARTY-02'
    WHEN 'OP06-GOODS-DESCRIPTION-CORRESPONDS' THEN 'GOODS-01'
    WHEN 'OP07-BL-ONBOARD-VALID'              THEN 'SHIP-01'
    WHEN 'OP08-BL-CLEAN'                      THEN 'DOC-02'
    WHEN 'OP09-46A-DOC-SET-COMPLETE'          THEN 'DOC-01'
    WHEN 'OP10-BC-WC-46A-COMPLIANCE'          THEN 'COND-01'
    ELSE target
END
WHERE  action IN ('rule_override', 'rule_override_cleared');

COMMIT;
