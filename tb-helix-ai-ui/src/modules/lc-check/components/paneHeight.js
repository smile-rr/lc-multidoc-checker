// The height a working pane gets on the case screen.
//
// Tall enough to read a page in, short enough that the columns beside it stay on
// screen — and the same in every mode, because Review's two modes sit in the same
// place under the same header and a pane that changes height when you switch reads
// as a different screen.
//
// It also means what it says structurally: a pane with a bounded height gives its
// columns their own scrollbars. Without one, the whole page scrolls and the list you
// are navigating with slides away with the content you are reading.
export const WORKBENCH_H = 'calc(100vh - var(--case-header-h, 240px) - 168px)'
