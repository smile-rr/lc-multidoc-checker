// Maps a canonical field key → its accordion group in the Reconcile pivot.
// Mirrors the design prototype's groupOf() logic.

const TESTS = [
  { group: 'Parties',          re: /(applicant|beneficiary|consignee|notify|shipper|issuer)/i },
  { group: 'Money',            re: /(amount|currency|tolerance|charges|price|value)/i },
  { group: 'Goods',            re: /(goods|description|hs|quantity|weight|packing|origin|incoterm)/i },
  { group: 'Shipment & dates', re: /(shipment|loading|discharge|port|date|on.?board|expiry|presentation)/i },
  { group: 'Documentary refs', re: /(invoice|bl|bill|certificate|insurance|cert|number|ref)/i },
];

export const GROUP_ORDER = [
  'Parties',
  'Money',
  'Goods',
  'Shipment & dates',
  'Documentary refs',
  'Other',
];

export function groupOf(fieldKey) {
  if (!fieldKey) return 'Other';
  for (const t of TESTS) {
    if (t.re.test(fieldKey)) return t.group;
  }
  return 'Other';
}
