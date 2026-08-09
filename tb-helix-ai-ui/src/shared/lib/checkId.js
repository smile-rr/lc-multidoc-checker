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
//   REQ-47A.2     second requirement this credit imposed, read from field 47A
//                                               (written by the planner)
//   USER-01       added by an officer on a case
//
// THE CLAUSE SUFFIX IS THE NAMESPACE
//
// An author and the planner mint into one column with a uniqueness constraint
// over it, and what keeps them apart is the suffix, not the prefix:
//
//   · an authored id NEVER carries one   — COND-47A is the standing check
//   · a planner id ALWAYS carries one    — COND-47A.1 is one clause of this credit
//
// So `REQ` is free for both. The planner uses it for every requirement it reads
// out of a credit, numbered once through whichever tag each came from, so a plan
// reads REQ-46A.1 … REQ-46A.5, REQ-47A.6 rather than two concern prefixes
// alternating and each restarting its count.
//
// Rules
//   · one id per check, for the life of the check
//   · never reuse an id, even after a check is retired
//   · never author an id containing a dot
//   · a finding always carries the id of the check that produced it, or null
//     when nothing checked it — an uncovered condition must not borrow one
// ===========================================================================

/** The concern prefixes. Adding one is a governance decision, not a code change. */
export const CONCERNS = {
  REQ: 'Requirements — what this credit calls for, read from 46A and 47A',
  AVAIL: 'Availability — where and how the credit may be used',
  TRANSF: 'Transfer — second beneficiary, substitution and routing',
  SIGN: 'Signatures and the capacity they were given in',
  CORR: 'Corrections and how they are authenticated',
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

// ===========================================================================
// THE AUTHORED SCHEME: <KIND><NNNN>
//
// The catalogue's own checks are numbered by the kind of thing they are:
//
//     A0001   an agent check      — an examiner reads and answers
//     C0001   a comparison        — the tree editor, rows of operands
//     E0001   an expression       — a condition written as text
//
// This is a different trade from the concern-anchor form below, and worth being
// explicit about which one it makes. `DATE-31D` is self-describing: it says both
// "a date check" and "the one that reads tag 31D". `E0001` says neither. What it
// buys is a rulebook that sorts by kind, is short enough to say aloud on a call,
// and never has to be renegotiated when a check's subject broadens — TRANS-20
// held four subjects for its whole life and its id claimed one.
//
// TWO THINGS THAT FOLLOW, AND ARE NOT NEGOTIABLE
//
//   · The letter is what the check was when it was written, and it is never
//     rewritten. A check that gains a judgement operator becomes JUDGED and
//     still keeps its `C`. An id on a refusal notice from two years ago has to
//     resolve, and the kind is served — `tier` and `language` — so nothing has
//     to read it out of the id anyway.
//   · The planner's namespace is unaffected. What separates authored ids from
//     planner-minted ones is the CLAUSE SUFFIX, not the prefix: an authored id
//     never carries a dot and `REQ-46A.1` always does. Both schemes below hold
//     that line.
//
// The concern-anchor form remains valid and is still what the planner mints, so
// both parse. Neither is being migrated to the other.
// ===========================================================================

// 2–6 letters: `XD` (cross-document) is a legitimate two-letter concern, and the
// pattern rejecting it was the pattern being wrong, not the id.
const PATTERN = /^([A-Z]{2,6})-([A-Z0-9]{1,6})(?:\.(\d{1,2}))?$/

/** The authored kind-and-number form. */
const KIND_PATTERN = /^([ACE])(\d{3,5})$/

export const KINDS = {
  A: 'Agent — an examiner reads the documents and answers',
  C: 'Comparison — rows of operands, built in the form',
  E: 'Expression — a condition written as text',
}

/**
 * @param {string} id
 * @returns {{ concern: string, anchor: string, clause: number|null, concernLabel: string }|null}
 */
export function parseCheckId(id) {
  const text = String(id ?? '')
  const k = KIND_PATTERN.exec(text)
  if (k) {
    const [, kind, seq] = k
    // `anchor` is the number so a caller that only wanted "the part after the prefix" still
    // gets it; `clause` is null, which is what keeps this an AUTHORED id.
    return { concern: kind, anchor: seq, clause: null, kind, concernLabel: KINDS[kind] }
  }
  const m = PATTERN.exec(text)
  if (!m) return null
  const [, concern, anchor, clause] = m
  return {
    concern,
    anchor,
    clause: clause ? Number(clause) : null,
    kind: null,
    concernLabel: CONCERNS[concern] ?? 'Unknown concern',
  }
}

export const isValidCheckId = (id) =>
  KIND_PATTERN.test(String(id ?? '')) || PATTERN.test(String(id ?? ''))

export function formatCheckId({ concern, anchor, clause, kind }) {
  if (kind) return `${kind}${anchor}`
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
