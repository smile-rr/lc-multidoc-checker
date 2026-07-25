// ===========================================================================
// MT700 text → anchored tag lines.
//
// The credit arrives as a raw SWIFT message. Splitting it into one record per
// tag gives every field a stable anchor id (`tag-44C`), which is what lets a
// value in the fields panel light up the exact line it was read from.
//
// The backend does the authoritative parse (Prowide, in lc-checker-v2-svc). This
// is the display-side split only: it preserves the original text verbatim,
// including continuation lines, and never reinterprets a value.
// ===========================================================================

/** Tags whose value is a party block — several lines of name and address. */
const TAG_LABELS = {
  27: 'Sequence of total',
  '40A': 'Form of credit',
  20: 'Credit number',
  '31C': 'Date of issue',
  '40E': 'Applicable rules',
  '31D': 'Expiry',
  50: 'Applicant',
  59: 'Beneficiary',
  '32B': 'Currency and amount',
  '39A': 'Tolerance',
  '41A': 'Available with / by',
  '41D': 'Available with / by',
  '42C': 'Drafts at',
  '42A': 'Drawee',
  '42D': 'Drawee',
  '43P': 'Partial shipments',
  '43T': 'Transhipment',
  '44A': 'Place of taking in charge',
  '44E': 'Port of loading',
  '44F': 'Port of discharge',
  '44B': 'Place of final destination',
  '44C': 'Latest shipment date',
  '45A': 'Description of goods',
  '46A': 'Documents required',
  '47A': 'Additional conditions',
  48: 'Period for presentation',
  49: 'Confirmation instructions',
  '71B': 'Charges',
  78: 'Instructions to the paying bank',
  57: 'Advise through bank',
  53: 'Reimbursing bank',
}

export const tagLabel = (tag) => TAG_LABELS[tag] || null

/**
 * Split a raw MT700 into displayable lines.
 *
 * Block 4 tags become one line each (`{ id: 'tag-44C', tag, label, text }`).
 * The envelope blocks (1, 2, 3) and the trailer are kept as their own lines so
 * the officer sees the message exactly as received, but carry no tag.
 *
 * @param {string} raw
 * @returns {{ id: string, tag: string|null, label: string|null, text: string }[]}
 */
export function parseMt700Lines(raw) {
  if (!raw) return []

  const lines = String(raw).replace(/\r\n/g, '\n').split('\n')
  const out = []
  let current = null
  let envelopeSeq = 0

  const flush = () => {
    if (current) {
      // Trim only trailing blank lines; interior spacing is part of the field.
      current.text = current.text.replace(/\s+$/, '')
      out.push(current)
      current = null
    }
  }

  for (const line of lines) {
    const tagMatch = /^:([0-9]{2}[A-Z]?):(.*)$/.exec(line)

    if (tagMatch) {
      flush()
      const [, tag, rest] = tagMatch
      current = {
        id: `tag-${tag}`,
        tag,
        label: tagLabel(tag),
        // Keep the `:20:` prefix visible — officers read SWIFT, not prose.
        text: rest.trim() ? `:${tag}: ${rest.trim()}` : `:${tag}:`,
      }
      continue
    }

    // Envelope / trailer lines stand alone.
    if (/^[{-]/.test(line.trim()) && !current) {
      envelopeSeq += 1
      out.push({ id: `env-${envelopeSeq}`, tag: null, label: null, text: line })
      continue
    }

    if (current) {
      // Continuation of the field above.
      current.text += `\n${line.replace(/\s+$/, '')}`
      continue
    }

    if (line.trim()) {
      envelopeSeq += 1
      out.push({ id: `env-${envelopeSeq}`, tag: null, label: null, text: line })
    }
  }

  flush()
  return out
}

/** Raw value of one tag, envelope prefix stripped. Null when absent. */
export function tagValue(lines, tag) {
  const hit = lines.find((l) => l.tag === tag)
  if (!hit) return null
  return hit.text.replace(new RegExp(`^:${tag}:\\s*`), '').trim()
}
