// How a working pane gets its height on the case screen.
//
// **It fills.** The workbench is exactly one viewport tall: the header takes what it
// needs and the stage gets the rest, so a pane reaches the bottom of the window
// because its parent ends there — not because it subtracted a number from `100vh`.
//
// Those subtractions were the bug. Three of them existed, they disagreed (44px in
// one place, 168px in another), and each was a guess at the sum of everything above
// the pane: the case header, the screen's padding, a section heading, a row of tabs.
// Any of those changing left dead air under the pane or pushed its foot off-screen,
// and no arithmetic can be right for every stage at every window width.
//
// So the rule is: a bounded parent, and `PANE_FILL` on the thing that should reach
// the bottom of it. Scrolling then belongs to a named pane rather than to the page.
export const PANE_FILL = { flex: 1, minHeight: 0 }
