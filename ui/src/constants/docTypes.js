// Single source of truth for DocType metadata across the v2 UI.
// Mirrors backend DocType.java enum values.
export const DOC_TYPES = [
  { id: 'LC',      short: 'LC',  name: 'Letter of Credit',       icon: '◇', color: '#0a7e6a' },
  { id: 'INV',     short: 'INV', name: 'Commercial Invoice',     icon: '▦', color: '#0066cc' },
  { id: 'BOL',     short: 'BOL', name: 'Bill of Lading',         icon: '⛴', color: '#8a5700' },
  { id: 'PKL',     short: 'PKL', name: 'Packing List',           icon: '☰', color: '#7a2d8e' },
  { id: 'BOE',     short: 'BOE', name: 'Bill of Exchange',       icon: '✎', color: '#cc4400' },
  { id: 'BC',      short: 'BC',  name: 'Beneficiary Certificate', icon: '◈', color: '#1a7a43' },
  { id: 'WC',      short: 'WC',  name: 'Warranty Certificate',   icon: '★', color: '#cc8800' },
  { id: 'UNKNOWN', short: '?',   name: 'Unknown — needs classification', icon: '?', color: '#6e6e73' },
];

export const DOC_TYPE_MAP = Object.fromEntries(DOC_TYPES.map(t => [t.id, t]));

export function docTypeMeta(id) {
  return DOC_TYPE_MAP[id] || { id, short: id || '?', name: id || 'Unknown', icon: '?', color: '#6e6e73' };
}
