// Text-overflow styles, so "this must not push the row wider" is written the
// same way everywhere instead of three properties remembered from memory.
export const ellipsis = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

/** Clamp to n lines. Wraps, then cuts with an ellipsis. */
export const clampLines = (n = 2) => ({
  display: '-webkit-box',
  WebkitLineClamp: n,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
})
