// Mirrors DocTypeRegistry.classifyFilename() on the backend.
// Priority order: longest/most-specific keyword first.
const RULES = [
  { keywords: ['bill-of-lading', 'bol'],         type: 'BOL' },
  { keywords: ['bill-of-exchange', 'boe'],        type: 'BOE' },
  { keywords: ['packing-list'],                   type: 'PKL' },
  { keywords: ['beneficiary-cert', '-bc-', '-bc.'], type: 'BC' },
  { keywords: ['warranty-cert', '-wc-', '-wc.'],  type: 'WC' },
  { keywords: ['invoice'],                        type: 'INV' },
  { keywords: ['mt700', '-lc-', '-lc.'],          type: 'LC' },
];

export function classifyFilename(name) {
  const lower = name.toLowerCase();
  for (const { keywords, type } of RULES) {
    if (keywords.some(k => lower.includes(k))) return type;
  }
  return 'UNKNOWN';
}

export const DOC_TYPE_LABELS = {
  LC:      'Letter of Credit (MT700)',
  INV:     'Commercial Invoice',
  BOL:     'Bill of Lading',
  PKL:     'Packing List',
  BOE:     'Bill of Exchange',
  BC:      'Beneficiary Certificate',
  WC:      'Warranty Certificate',
  UNKNOWN: 'Unknown',
};
