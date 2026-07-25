// ===========================================================================
// lc-check — data contracts.
//
// These typedefs are the module's wire format. Fixtures satisfy them today and
// the backend must satisfy them tomorrow: screens read only these shapes, never
// a fixture directly, so swapping the mock adapter for HTTP is a change in
// `api/` alone.
//
// JSDoc rather than TypeScript on purpose — the platform is JS end to end, and
// these annotations give editor completion and a reviewable schema without
// forcing a migration of the 3.5k lines of governance code alongside it.
//
// Naming rule: domain vocabulary, not presentation. No colours, no CSS, no
// pre-formatted strings. Anything a designer might restyle is derived in the
// view layer from these values.
// ===========================================================================

/**
 * How a document was rendered into text, and how much to trust it.
 * @typedef {'text'|'ocr'} ExtractionMode
 */

/**
 * A single extracted line of a document. `id` is the anchor other records point
 * at to say "this value came from here" — it must be stable across a re-read of
 * the same page or provenance highlighting breaks.
 * @typedef {object} DocLine
 * @property {string} id
 * @property {string} text  May contain newlines for a wrapped SWIFT field.
 */

/**
 * A value the extractor read off a document, with its provenance.
 *
 * Provenance takes one of two forms, because the two document kinds are shown
 * differently. The credit is rendered as text, so a fact points at the exact
 * line (`anchorId`) and hovering highlights it. A presented document is rendered
 * as the scanned PDF, where we have no character coordinates — so a fact points
 * at a page and selecting it turns the viewer to that page.
 *
 * @typedef {object} Fact
 * @property {string} docId
 * @property {string|null} anchorId  DocLine.id this was read from (credit only).
 * @property {number|null} page      Bundle page it was read from (presented docs).
 * @property {string} label
 * @property {string} value
 * @property {string} source     Human-facing citation, e.g. ':32B:' or 'p.4'.
 * @property {string|null} flag  Why a human should look, or null when unremarkable.
 */

/**
 * A signature, stamp or handwritten annotation found on a page.
 * @typedef {object} Mark
 * @property {'signature'|'stamp'|'handwriting'} kind
 * @property {string} text
 * @property {string} source
 * @property {'success'|'warning'|'error'} confidence  Whether it could be read.
 */

/**
 * @typedef {'credit'|'presented'} DocumentRole
 * `credit` is the LC itself (MT700). `presented` is anything in the bundle the
 * beneficiary submitted.
 */

/**
 * One logical document. In a deal bundle several of these are carved out of a
 * single scanned PDF, so `pageRange` refers to pages of the bundle.
 * @typedef {object} LcDocument
 * @property {string} id
 * @property {DocumentRole} role
 * @property {string} docType        e.g. 'Commercial invoice'
 * @property {string} abbr           2-letter rail badge, e.g. 'IN'
 * @property {string} fileName
 * @property {string} reference      The document's own number.
 * @property {string} icon           lucide name.
 * @property {[number,number]|null} pageRange  Inclusive bundle pages, null for the credit.
 * @property {number[]} [pages]      Exact bundle pages, for non-contiguous segments.
 * @property {ExtractionMode} extraction
 * @property {boolean} lowConfidence Some part could not be read cleanly.
 * @property {string|null} scanNote  What specifically was hard to read.
 * @property {string} title          Header shown above the page viewer.
 * @property {string} meta           Provenance line, e.g. 'scan pages 2-3 of 12 · 300 dpi'.
 * @property {DocLine[]} lines
 * @property {Mark[]} marks
 */

/**
 * The bundle's physical page map: what each scanned page turned out to be.
 * @typedef {object} BundlePage
 * @property {number} number
 * @property {string|null} docId  null for the covering schedule.
 * @property {string} label
 */

/**
 * @typedef {'discrepancy'|'possible'|'clean'|'manual'} Severity
 * - discrepancy: will not pass as presented
 * - possible:    flagged, needs a human call
 * - clean:       checked and satisfied
 * - manual:      not covered by the engine — a human must decide
 */

/**
 * @typedef {object} TraceEntry
 * @property {string} key
 * @property {string} value
 */

/**
 * A single conclusion, with everything needed to defend it. `expected` and
 * `quote` are the two sides of the comparison the officer is being asked to
 * confirm; `reason` is the rule that makes the difference matter.
 * @typedef {object} Finding
 * @property {string} id
 * @property {Severity} severity
 * @property {string} area          Concern label, e.g. 'Shipment terms'.
 * @property {string|null} areaId   CheckArea that produced it.
 * @property {string|null} checkId  PlanCheck that produced it.
 * @property {string} docId
 * @property {string|null} anchorId
 * @property {number|null} page       Bundle page the quoted evidence sits on.
 * @property {string} creditAnchorId  Line of the credit this is measured against.
 * @property {string} title
 * @property {string} detail
 * @property {string} expected
 * @property {string} quote
 * @property {string} quoteSource
 * @property {string} reason
 * @property {TraceEntry[]} trace
 */

/**
 * @typedef {'planned'|'queued'|'running'|'done'|'skipped'} CheckStatus
 * `skipped` means a trigger said the credit does not bring the check into play.
 * That is recorded, never silent.
 */

/**
 * One check in the plan for a case.
 * @typedef {object} PlanCheck
 * @property {string} id            e.g. 'CHK-20'
 * @property {string} name
 * @property {string|null} areaId
 * @property {string} appliesBecause  Why this credit triggers it.
 * @property {string} ruleRef         UCP/ISBP citation.
 * @property {string|null} findingId  Populated once the check has run.
 * @property {boolean} addedByOfficer Recorded against the officer's name.
 */

/**
 * A grouping of checks run by one agent.
 * @typedef {object} CheckArea
 * @property {string} id
 * @property {string} name
 * @property {'domain'|'main'|'policy'} kind
 * @property {number} wave        Execution order; areas in a wave run together.
 * @property {string} purpose
 * @property {string[]} checkIds
 */

/**
 * Cost and latency for one agent run. Kept in raw units — the UI formats.
 * @typedef {object} RunStep
 * @property {string} id
 * @property {string} name
 * @property {string} role
 * @property {number} seconds
 * @property {number} tokensIn
 * @property {number} tokensOut
 * @property {number} cachePct
 * @property {number} retries
 */

/**
 * @typedef {'agreed'|'parked'|'rejected'} Disposition
 * - agreed:   the finding stands and will be raised
 * - parked:   the officer wants a second opinion
 * - rejected: the officer overrides the engine; goes back to the model team
 */

/**
 * @typedef {object} FindingDecision
 * @property {string} findingId
 * @property {Disposition} disposition
 * @property {string} note
 */

/**
 * @typedef {'refuse'|'waiver'|'second'} Verdict
 */

/**
 * @typedef {'intake'|'interpret'|'checks'|'review'|'decide'} Stage
 * The officer-paced pipeline. Only intake is automatic; every later stage waits
 * for the officer to start it.
 */

/**
 * @typedef {'awaiting_check'|'running'|'discrepancies'|'to_decide'|'clean'|'with_authoriser'} CaseStatus
 */

/**
 * How far a review has got. Carried on the case so a case that was examined
 * earlier opens with its findings in place, rather than the UI assuming every
 * case starts unexamined.
 * @typedef {object} RunState
 * @property {boolean} started
 * @property {boolean} finished
 * @property {number} segmented          Documents carved out of the bundle so far.
 * @property {string[]} completedAreaIds  Areas that have returned.
 */

/**
 * List-view summary of a case. Deliberately smaller than CaseDetail so the
 * cases screen never pulls whole documents.
 * @typedef {object} CaseSummary
 * @property {string} id             e.g. 'CHK-26-0731-014'
 * @property {string} creditRef
 * @property {string} beneficiary
 * @property {string} currency
 * @property {number} amount
 * @property {number} pageCount
 * @property {CaseStatus} status
 * @property {string} statusLabel
 * @property {number|null} replyDueDays  null when nothing is outstanding.
 * @property {boolean} mine
 */

/**
 * @typedef {object} CreditTerms
 * @property {string} creditRef
 * @property {string} issuedDate
 * @property {string} applicant
 * @property {string} beneficiary
 * @property {string} currency
 * @property {number} amount
 * @property {number} tolerancePct
 * @property {string} latestShipment
 * @property {string} expiry
 * @property {string} expiryPlace
 * @property {number} presentationDays
 * @property {string} tenor
 * @property {string} goods
 */

/**
 * Everything the case workbench needs for one case.
 * @typedef {object} CaseDetail
 * @property {string} id
 * @property {CaseStatus} status
 * @property {CreditTerms} credit
 * @property {string} presentedDate
 * @property {string} presentingBank
 * @property {number|null} replyDueDays
 * @property {string} authoriser
 * @property {string} pdfUrl         Where the presentation bundle PDF is served.
 * @property {number} totalPages     Pages in the bundle.
 * @property {RunState} runState     The run state this case is already in.
 * @property {LcDocument[]} documents
 * @property {BundlePage[]} bundlePages
 * @property {Fact[]} facts
 * @property {CheckArea[]} areas
 * @property {PlanCheck[]} checks
 * @property {Finding[]} findings
 * @property {RunStep[]} runSteps
 * @property {string} runModelSummary
 */

export {}
