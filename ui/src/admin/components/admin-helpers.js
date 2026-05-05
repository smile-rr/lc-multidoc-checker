// Shared admin helpers — doc-type names, table sort.
import { DOC_TYPE_MAP } from '../../constants/docTypes';

const ADMIN_DOC_EXTRA = {
  INS: { id: 'INS', name: 'Insurance Document', short: 'INS', icon: '◯', color: '#cc0011' },
};

export function docTypeName(id) {
  return (DOC_TYPE_MAP[id]?.name) || (ADMIN_DOC_EXTRA[id]?.name) || id;
}

export function docTypeShort(id) {
  return (DOC_TYPE_MAP[id]?.short) || (ADMIN_DOC_EXTRA[id]?.short) || id;
}

export function docTypeColor(id) {
  return (DOC_TYPE_MAP[id]?.color) || (ADMIN_DOC_EXTRA[id]?.color) || '#6e6e73';
}
