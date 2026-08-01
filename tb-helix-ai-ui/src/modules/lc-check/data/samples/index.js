// The three real presentation bundles from `test/cases/`, as mock fixtures.
//
// The MT700s are imported as raw text and parsed at load, so the credit an
// officer reads is byte-for-byte the file the backend would receive. Bundle
// PDFs are not shipped — mock mode shows the credit without a PDF pane.
//
// Page → document mapping mirrors each bundle's `deal.manifest.yml`. Keep them
// in step: if a manifest changes, the segments below must change with it, or the
// rail will point at the wrong pages.

import lc01 from './lc-01.txt?raw'
import lc02 from './lc-02.txt?raw'
import lc03 from './lc-03.txt?raw'

/** Doc-type codes used by the manifests, with display metadata. */
export const DOC_TYPES = {
  INV: { docType: 'Commercial Invoice', abbr: 'IN', icon: 'receipt' },
  BOL: { docType: 'Bill of Lading', abbr: 'BL', icon: 'ship' },
  PKL: { docType: 'Packing List', abbr: 'PL', icon: 'package' },
  BOE: { docType: 'Bill of Exchange', abbr: 'BE', icon: 'banknote' },
  BC: { docType: "Beneficiary's Certificate", abbr: 'BC', icon: 'pen-line' },
  WC: { docType: 'Warranty Certificate', abbr: 'WC', icon: 'shield-check' },
}

/** Segment order is the physical page order in the bundle. */
const SEGMENTS = [
  { code: 'INV', pages: [1] },
  { code: 'BOL', pages: [2] },
  { code: 'PKL', pages: [3] },
  { code: 'BOE', pages: [4] },
  { code: 'BC', pages: [5] },
  { code: 'WC', pages: [6] },
]

/** Case 02: image-only deal with blank trailing pages on INV / PKL / BC. */
const SEGMENTS_02 = [
  { code: 'INV', pages: [1, 2] },
  { code: 'BOL', pages: [3] },
  { code: 'PKL', pages: [4, 5] },
  { code: 'BOE', pages: [6] },
  { code: 'BC', pages: [7, 8] },
  { code: 'WC', pages: [9] },
]

export const SAMPLES = {
  '01': { id: '01', lcText: lc01, pdfUrl: null, totalPages: 6, segments: SEGMENTS },
  '02': { id: '02', lcText: lc02, pdfUrl: null, totalPages: 9, segments: SEGMENTS_02 },
  '03': { id: '03', lcText: lc03, pdfUrl: null, totalPages: 6, segments: SEGMENTS },
}
