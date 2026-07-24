/** @returns {'text'|'pdf'|null} */
export function uploadPreviewKind(item) {
  if (!item?.file) return null;
  const n = (item.file.name || '').toLowerCase();
  if (item.detectedType === 'LC' || item.detectedType === 'TXT') return 'text';
  if (n.endsWith('.txt') || n.endsWith('.fin') || n.endsWith('.swift')) return 'text';
  if (item.detectedType === 'DEAL' || n.endsWith('.pdf')) return 'pdf';
  return null;
}

export function isUploadPreviewable(item) {
  return uploadPreviewKind(item) != null;
}
