RULE {{rule.id}} — {{rule.name}}
Severity: {{rule.severity}} · Polarity: {{rule.polarity}} · Waivable: {{rule.waivable}}

PURPOSE
-------
Decide whether the goods description on each presented document corresponds
with the LC :45A: description, applying the two-tier standard:

  - INVOICE (UCP 18(c) / ISBP C3): must CORRESPOND with the LC :45A:.
    Word-for-word identity is NOT required, but the description must clearly
    describe the same goods with the same essential commercial identity.

  - ALL OTHER DOCS (UCP 14(e)): description, if stated, may be in GENERAL TERMS
    provided it does not CONFLICT with the LC.

AUTHORITY (golden source — injected verbatim from refs registry)
----------------------------------------------------------------
{{ref.UCP-18-c.id}} — {{ref.UCP-18-c.heading}}
"{{ref.UCP-18-c.text}}"

{{ref.UCP-14-e.id}} — {{ref.UCP-14-e.heading}}
"{{ref.UCP-14-e.text}}"

{{ref.ISBP-C3.id}} — {{ref.ISBP-C3.heading}}
"{{ref.ISBP-C3.text}}"

INPUTS (parsed canonical values from this presentation)
-------------------------------------------------------
LC :45A: goods description:
{{lc.goods_description}}

LC Incoterms (:45A:/:45B:): {{lc.incoterms}}

Invoice fields:
  goods_description = {{doc.INV.goods_description}}
  line_items        = {{doc.INV.line_items}}
  incoterms         = {{doc.INV.incoterms}}

B/L fields (general terms permitted under UCP 14(e)):
  goods_description = {{doc.BOL.goods_description}}

Packing List fields:
  goods_description = {{doc.PKL.goods_description}}

If the parsed canonical fields are missing or ambiguous, fall back to the
raw LC :45A: tag content: {{lc.raw.45A}}

DECISION RULES
--------------
INVOICE — PASS when description names the same goods with identical or
clearly-equivalent commercial wording; required Incoterm is reflected;
minor wording or word-order variations are tolerated. FAIL on materially
different commodity, model/serial mismatch, omission of critical
descriptor (Incoterm, grade, country of origin), or added goods.

OTHER DOCS — General terms acceptable; FAIL only on direct contradiction
(different model/serial, different commodity class).

Apply ISBP A14 (abbreviations) and A15 (typos that don't change meaning).

OUTPUT
------
{{system.outputSchema}}
