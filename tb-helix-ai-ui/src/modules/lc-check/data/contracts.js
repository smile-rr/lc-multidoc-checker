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
 * Something on a page that is not text — read by looking at the document rather than
 * by reading it. Produced by the attest pass, and only for document types the
 * dictionary has bound an attestation to.
 * @typedef {object} Mark
 * @property {string} docId
 * @property {'signature'|'seal'|'stamp'|'handwriting'|'correction'|'tick'|'strikethrough'|'label'} kind
 * @property {number|null} page       Bundle page. Selecting the mark turns the viewer to it.
 * @property {string|null} placement  Where it sits, in words — a scan has no coordinates.
 * @property {string|null} readsAs    What it reads, verbatim. Null when it cannot be read.
 * @property {string|null} party      Whose mark it appears to be.
 * @property {string|null} capacity   'as agent for XYZ Lines, the carrier'. UCP 600
 *   art. 20(a)(i) is not satisfied by a signature that does not state this.
 * @property {string|null} medium     handwritten | facsimile | rubber stamp | embossed |
 *   perforated | electronic | printed. UCP 600 art. 3 accepts all of them.
 * @property {string|null} authenticates  What this mark exists to authenticate, when it
 *   does — an initialled correction, a signed on-board notation.
 * @property {boolean} legible        False when the mark is there and cannot be read.
 *   With a null readsAs this is the distinction that matters: present-but-unreadable is
 *   not the same as absent, and only absent is a discrepancy.
 * @property {'HIGH'|'MED'|'LOW'} confidence
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
 * @property {boolean} attested  Whether the attest pass looked at this document. Distinct
 *   from `marks.length === 0`: examined-and-clean is a conclusion, never-examined means no
 *   attestation is bound to this document type. The Marks tab renders them differently.
 * @property {string|null} [layoutMd] Layout-preserving markdown of the pages (extract.doc.md).
 */

/**
 * The bundle's physical page map: what each scanned page turned out to be.
 * @typedef {object} BundlePage
 * @property {number} number
 * @property {string|null} docId  null for the covering schedule.
 * @property {string} label
 */

/**
 * @typedef {'DISCREPANT'|'DOUBT'|'CLEAN'|'NOT_RUN'} Outcome
 * What came of a check. One vocabulary from the plan to the advice — see
 * `state/outcome.js`.
 * - DISCREPANT: a ground to refuse on
 * - DOUBT:      nothing settled it; waiting on a person, and `outcomeReason` says why
 * - CLEAN:      it held
 * - NOT_RUN:    no result exists. Never carried by a finding — a finding *is* a
 *               result — so it appears on a plan check that produced none.
 */

/**
 * @typedef {'LOW_CONFIDENCE'|'UNANSWERABLE'|'NO_RULE'|'HUMAN_ONLY'|'OFFICER_UNSURE'|'NOT_REACHED'|'TRIGGER_NOT_MET'|'SET_ASIDE'} OutcomeReason
 * Why an absence is what it is. Only DOUBT and NOT_RUN carry one; DISCREPANT and
 * CLEAN are conclusions and explain themselves.
 *
 * `OFFICER_UNSURE` is the one a person writes, and it is never stored on the finding —
 * it is derived where an override sets DOUBT. That is what keeps "the engine could not
 * settle this" and "the officer would not" answerable apart, now that both can say it.
 */

/**
 * @typedef {'DISCREPANT'|'FURTHER_CHECK'|'CLEAN'} DecisionStatus
 * Where a presentation lands. Derived from the findings' effective outcomes, and
 * overridable by the officer at sign-off.
 *
 * Deliberately not `CaseStatus`, which is taken and means something else — the
 * badge on the case list, which mixes lifecycle (`running`, `with_authoriser`) with
 * result. This is the result alone.
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
 * @property {Outcome} outcome  The engine's own value. An officer's disagreement is
 *   recorded beside it, never over it — see `officer.overrides`.
 * @property {OutcomeReason|null} [outcomeReason]
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
 * @typedef {'deterministic'|'semi-deterministic'|'human'} Coverage
 * How well a planned check can be settled at all. Derived by the service from the
 * tier it filed the check at, never authored beside it:
 * - deterministic:      an exact condition over extracted fields. Free, reproducible.
 * - semi-deterministic: an agent reads it and forms a view.
 * - human:              nothing on the plan tests it. The officer settles it.
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
 * @property {boolean} gate           A gate — settled on the credit and the
 *   presentation record alone, before a page is read. Runs with the plan, not the run.
 * @property {Coverage} coverage
 * @property {?string} suppressedBecause  The clause of *this* credit that stood a standing
 *   rule down, quoted. Null for every other kind of skip — which is what makes the two
 *   distinguishable, since both are a check that did not run. A suppression always raises a
 *   card asking the officer to confirm it, so it is never the last word.
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
 * The officer disagreeing with the engine on one finding.
 *
 * `outcome` is one of the two values an officer may write — `CLEAN` or
 * `DISCREPANT`. Never `DOUBT`, which is the engine reporting the limit of its own
 * reach rather than a confidence a person records, and never `NOT_RUN`, which is the
 * absence of a run.
 *
 * @typedef {object} OutcomeOverride
 * @property {string} findingId
 * @property {Outcome} outcome
 * @property {string} by
 * @property {string} at    ISO timestamp
 * @property {string} [note]
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
 * @property {string} stage              Where the case is sitting, by key.
 * @property {boolean} busy              A stage is running now. The workbench opens a
 *                                       progress stream on this, which is what lets a
 *                                       case be opened or reloaded mid-run and picked up.
 * @property {?string} error             What stopped it, if a stage failed. A halted run
 *                                       has to be distinguishable from a slow one.
 * @property {boolean} started
 * @property {boolean} finished          The run is over — including when the plan ended it.
 * @property {number} segmented          Documents carved out of the bundle so far.
 * @property {boolean} stoppedAfterPlan  The plan weighed a a gate failing against this
 *                                       credit and decided the remaining checks were spend
 *                                       on a settled question. Not a halt: the case parks at
 *                                       `execute` like any other and the ordinary run button
 *                                       finishes it. All it changes is that Auto stops.
 * @property {?string} stoppedBecause    The planner's reason, in the words shown on screen.
 * @property {number} remaining          Planned checks not yet run.
 * @property {number} humanReview        Planned checks nothing but a person can settle.
 * @property {'review'|'decision'} destination  Where an unattended run should leave the
 *                                       officer: the decision normally, the report when
 *                                       something on the plan needs a person.
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
 * @property {string} officer     Who is examining it — the name an override is initialled with.
 * @property {string} authoriser  Who signs after them.
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
 */

export {}
