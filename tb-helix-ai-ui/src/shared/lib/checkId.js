// ===========================================================================
// Check references.
//
// A check id is quoted in a refusal advice, in an audit file and in a dispute
// years later, so it has to be stable, unique and self-describing. `CHK-01` was
// none of those: sequential, meaningless, and impossible to reconcile with the
// governance dictionary, which had grown its own scheme (`CHK-AVL`, `CHK-BL`).
//
// The format follows the backend's rule catalogue convention (`catalog.yml`,
// keyed by concern prefix):
//
//     <CONCERN>-<ANCHOR>[.<clause>]
//
//   CONCERN  what the check is about — see CONCERNS below
//   ANCHOR   what it hangs off: the governing MT700 tag (44C, 47A, 31D) or the
//            UCP/ISBP article fragment (18C, 30A, A23). This is what makes the
//            id self-describing: DATE-44C says both "a date check" and "the one
//            that reads field 44C".
//   clause   optional, for one check per clause of a multi-part condition —
//            COND-47A.1 is the first condition in field 47A.
//
// Examples
//   DATE-44C      latest shipment date          (dictionary)
//   AMT-30A       amount within tolerance       (dictionary)
//   CR-47A.2      second requirement this credit imposed, read from field 47A
//                                               (written by the planner)
//   USER-01       added by an officer on a case
//
// `CR` is the planner's own namespace — every requirement it reads out of a credit,
// numbered once through whichever tag each came from, so a plan reads CR-46A.1 …
// CR-46A.5, CR-47A.6 rather than two concern prefixes alternating and each
// restarting its count. It is deliberately not a CONCERN below: a concern is a
// standing subject an author files a check under, and these are not authored.
//
// Rules
//   · one id per check, for the life of the check
//   · never reuse an id, even after a check is retired
//   · a finding always carries the id of the check that produced it, or null
//     when nothing checked it — an uncovered condition must not borrow one
// ===========================================================================

/** The concern prefixes. Adding one is a governance decision, not a code change. */
export const CONCERNS = {
  REQ: 'Requirements — what the credit calls for',
  DOCSET: 'Document set — presence, originals, signatures',
  DATE: 'Dates — shipment, presentation, expiry',
  AMT: 'Amounts — value, tolerance, unit price',
  GOODS: 'Goods — description and quantity',
  TRANS: 'Transport — form, endorsement, routing',
  CERT: 'Certificates — insurance, origin, inspection',
  COND: 'Additional conditions — free-text :47A:',
  XD: 'Cross-document consistency',
  PARTY: 'Parties — screening and financial crime',
  GEN: 'General examiner judgement',
  USER: 'Added by an officer on a single case',
}

// 2–6 letters: `XD` (cross-document) is a legitimate two-letter concern, and the
// pattern rejecting it was the pattern being wrong, not the id.
const PATTERN = /^([A-Z]{2,6})-([A-Z0-9]{1,6})(?:\.(\d{1,2}))?$/

/**
 * @param {string} id
 * @returns {{ concern: string, anchor: string, clause: number|null, concernLabel: string }|null}
 */
export function parseCheckId(id) {
  const m = PATTERN.exec(String(id ?? ''))
  if (!m) return null
  const [, concern, anchor, clause] = m
  return {
    concern,
    anchor,
    clause: clause ? Number(clause) : null,
    concernLabel: CONCERNS[concern] ?? 'Unknown concern',
  }
}

export const isValidCheckId = (id) => PATTERN.test(String(id ?? ''))

export function formatCheckId({ concern, anchor, clause }) {
  return `${concern}-${anchor}${clause ? `.${clause}` : ''}`
}

/** Where an id came from, inferred from its concern. */
export const checkIdOrigin = (id) => {
  const p = parseCheckId(id)
  if (!p) return 'unknown'
  if (p.concern === 'USER') return 'officer'
  if (p.clause != null) return 'planner'
  return 'dictionary'
}
