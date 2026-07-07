/**
 * Format 1-based page list for officer-facing labels (no "TIFF" / "p." prefix).
 * @param {number[]|null|undefined} pages
 * @returns {string|null}
 */
export function formatPageLabel(pages) {
  if (!pages?.length) return null;
  const sorted = [...pages].sort((a, b) => a - b);
  if (sorted.length === 1) return String(sorted[0]);
  const consecutive = sorted.every((p, i) => i === 0 || p === sorted[i - 1] + 1);
  if (consecutive) return `${sorted[0]}–${sorted[sorted.length - 1]}`;
  return sorted.join(', ');
}

/** @deprecated use formatPageLabel */
export function formatDealTiffPages(pages) {
  return formatPageLabel(pages);
}

export function hasDealTiffPages(docs, pageKey = 'deal_tiff_pages') {
  return docs.some(d => d[pageKey]?.length > 0);
}

export function dealTiffPageRange(docs, pageKey = 'deal_tiff_pages') {
  const all = docs.flatMap(d => d[pageKey] ?? []);
  if (!all.length) return null;
  const min = Math.min(...all);
  const max = Math.max(...all);
  return min === max ? `${min}` : `${min}–${max}`;
}
