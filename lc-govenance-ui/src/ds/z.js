// One z-index ladder for the whole app, so layering is intentional rather than
// a scatter of magic numbers.
//   content  — default flow (0)
//   nav      — sticky top navigation
//   drawer   — the floating review/assistant panel (contextual, non-blocking)
//   popover  — in-card menus/dropdowns; must sit above the drawer so they're
//              never clipped by it
//   modal    — full-screen overlays that block everything beneath
//   toolbar — a section's sticky toolbar (below the nav, above scrolling content)
export const Z = { toolbar: 90, nav: 100, drawer: 200, popover: 300, modal: 400 }
