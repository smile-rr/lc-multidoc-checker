// Single source of truth for DocType metadata across the v2 UI.
// Mirrors backend DocType.java enum values + doc-type-registry.yaml desc_en.
export const DOC_TYPES = [
  { id: 'LC',      short: 'LC',  name: 'Letter of Credit',        desc: 'Letter of Credit',       icon: '◇', color: '#0a7e6a' },
  { id: 'INV',     short: 'INV', name: 'Commercial Invoice',      desc: 'Commercial Invoice',     icon: '▦', color: '#0066cc' },
  { id: 'BOL',     short: 'BOL', name: 'Bill of Lading',          desc: 'Bill of Lading',         icon: '⛴', color: '#8a5700' },
  { id: 'PKL',     short: 'PKL', name: 'Packing List',            desc: 'Packing List',           icon: '☰', color: '#7a2d8e' },
  { id: 'BOE',     short: 'BOE', name: 'Bill of Exchange',        desc: 'Bill of Exchange',       icon: '✎', color: '#cc4400' },
  { id: 'BC',      short: 'BC',  name: 'Beneficiary Certificate', desc: 'Beneficiary Certificate', icon: '◈', color: '#1a7a43' },
  { id: 'WC',      short: 'WC',  name: 'Warranty Certificate',    desc: 'Warranty Certificate',   icon: '★', color: '#cc8800' },
  { id: 'UNKNOWN', short: '?',   name: 'Unknown — needs classification', desc: 'Unclassified document', icon: '?', color: '#6e6e73' },
];

export const DOC_TYPE_MAP = Object.fromEntries(DOC_TYPES.map(t => [t.id, t]));

/**
 * Display order — matches LC-checker review priority:
 *   1. LC      — source of truth (always first)
 *   2. INV     — primary commercial doc; ties everything together
 *   3. BOL     — shipment proof; required by UCP transport rules
 *   4. PKL     — supports INV (qty) + BOL (marks)
 *   5. BOE     — financial draft / draft drawn on bank
 *   6. BC      — beneficiary declarations
 *   7. WC      — quality/warranty certs
 *   8. UNKNOWN — needs officer classification (always last)
 */
export const DOC_TYPE_ORDER = ['LC', 'INV', 'BOL', 'PKL', 'BOE', 'BC', 'WC', 'UNKNOWN'];

const ORDER_RANK = Object.fromEntries(DOC_TYPE_ORDER.map((t, i) => [t, i]));

/** Stable comparator that sorts docs by review-priority order. */
export function compareDocType(a, b) {
  const ra = ORDER_RANK[a] ?? 99;
  const rb = ORDER_RANK[b] ?? 99;
  return ra - rb;
}

/** Sort an array of {doc_type} objects in review-priority order. */
export function sortByDocType(docs, key = 'doc_type') {
  return [...docs].sort((a, b) => compareDocType(a[key], b[key]));
}

/** Prefer deal TIFF page order when present; otherwise doc-type order. */
export function sortDocsForDisplay(docs, pageKey = 'deal_tiff_pages', typeKey = 'doc_type') {
  const dealOrdered = docs.some(d => d[pageKey]?.length > 0);
  if (!dealOrdered) return sortByDocType(docs, typeKey);
  return [...docs].sort((a, b) => {
    const pa = a[pageKey]?.[0] ?? 999;
    const pb = b[pageKey]?.[0] ?? 999;
    if (pa !== pb) return pa - pb;
    return compareDocType(a[typeKey], b[typeKey]);
  });
}

export function docTypeMeta(id) {
  return DOC_TYPE_MAP[id] || {
    id, short: id || '?', name: id || 'Unknown', desc: id || 'Unknown', icon: '?', color: '#6e6e73',
  };
}

/** Officer-facing label: API override → registry desc → short code. */
export function docSegmentLabel(doc) {
  if (!doc) return '';
  if (doc.doc_type_desc) return doc.doc_type_desc;
  const m = docTypeMeta(doc.doc_type);
  return m.desc || m.name || m.short;
}
