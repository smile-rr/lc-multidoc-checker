# tb-helix-ai-ui

Front end for **TB Helix AI** — the trade-finance AI workbench. A platform shell
hosting independent product modules:

| Module | What it is | Data |
|---|---|---|
| **LC check** | The officer-paced examination flow: a case moves Intake → Read → Plan & Execute → Review → Decision, with a human sign-off at every stage. | real credits + real scanned bundles; extractions and findings authored |
| **Governance** | The authoring surface behind the checks: plain-language *checks*, *domain agents*, the field/document *dictionary*, and the UCP 600 / ISBP 821 *reference library*. | mock (in-memory seed) |

## Demo cases

Every case is backed by an actual bundle from `test/cases/` — the credit is the
real MT700 text, the presentation is the real scanned PDF, and page numbers line
up with the bundle's manifest. Cases carry their own run state, so a finished
case opens straight onto its findings; no waiting on a run to see Review or
Decision.

| Case | Credit | State | Shows |
|---|---|---|---|
| `CHK-25-0128-014` | LCWIDG-2024-0317 · USD 60,000 | finished | 3 discrepancies, 3 to decide, 5 clean, 3 uncovered — the full review |
| `CHK-25-0128-011` | LCAPP-2025-1110 · USD 50,000 | fresh | the live run: segmentation, areas returning, findings appearing |
| `CHK-25-0127-009` | LC-ART-2022-0617 · GBP 100 | finished | a clean presentation |
| `CHK-25-0127-008` | LCAPP-2025-1110 · USD 50,000 | finished | 1 discrepancy |
| `CHK-25-0126-004` | LCWIDG-2024-0317 · USD 60,000 | with authoriser | a submitted case |

The check plan is trigger-gated per credit, which the fixtures exercise for real:
case 01 carries a `:44C:` latest-shipment date and plans 20 checks with 2 not
run; cases 02 and 03 have no `:44C:`, so they plan 19 with 4 not run — and the
ones that did not run are listed with the reason.

This is the base for the whole UI/UX going forward. The backend service is wired
in later — see [The API seam](#the-api-seam).

## Run

```bash
npm install
npm run dev      # http://127.0.0.1:5174
npm run build    # production build → dist/
npm run smoke    # render every route + case stage in Node; catches render crashes
```

Port **5174** stays clear of the legacy examination `ui/` on 5173. `/api` proxies
to `lc-checker-v2-svc` on 9082.

There is no unit-test suite. `npm run smoke` is the cheap safety net: it
server-renders every route and every case stage in both a fresh and a finished
run state, so a render-time crash fails fast.

## Layout

Three levels, and the dependency rule is one-directional: **modules may import
`shared`; nothing may import a module except the registry.**

```
src/
├── shared/                  no domain knowledge — reusable by any module
│   ├── ds/                  design system — see "The design system" below
│   ├── styles/              tokens.css (Memara tokens) + base.css
│   └── lib/                 tone.js (one severity vocabulary), format.js,
│                             ruleTokens.js (the rule-writing vocabulary)
│
├── platform/                the app frame — owns the rail and the URL space
│   ├── AppShell.jsx         236px rail + module route outlet
│   ├── SideNav.jsx          level 1 = module, level 2 = that module's entries
│   ├── moduleRegistry.js    the ONLY place a module is named
│   └── NotFound.jsx
│
└── modules/
    ├── lc-check/
    │   ├── index.jsx        module descriptor (nav entry + routes)
    │   ├── data/            contracts.js (the wire format), fixtures.js,
    │   │                    checkSpecs.js (rule text + execution-plan builder),
    │   │                    samples/ (real MT700 text + manifests)
    │   ├── api/             lcCheckApi.js — the single data-access seam
    │   ├── lib/             mt700.js — raw SWIFT → anchored tag lines
    │   ├── state/           CaseContext.jsx (case state + run engine),
    │   │                    severity.js (severity/stage/disposition vocabulary),
    │   │                    runCost.js (run cost arithmetic)
    │   ├── screens/         Cases, CaseWorkbench, Intake, Read, Checks,
    │   │                    Review, Decision
    │   └── components/      CaseHeader, DocRail, BundleViewer, Mt700TextViewer,
    │                        FactsPanel, CheckSpecCard, PlanPayload,
    │                        FindingCard, FindingAnalysis, DispositionChips,
    │                        MarksPanel, AskDrawer, CostDrawer, NewCheckModal
    │
    └── governance/
        ├── index.jsx        module descriptor
        ├── sections.js      its four entry points
        ├── GovernanceModule.jsx   root; one state object + deriveVals
        ├── store.js         ported state + view-model derivation + seed data
        ├── data/seed.json
        ├── sections/        ChecksSection, AgentsList, AgentDetail,
        │                    Dictionary, Library, CheckDetail
        ├── components/      Check (card shell), RuleCard, RequirementCard,
        │                    CheckRow, AgentCheckRow, ReviewPanel, RuleEditor
        └── modals/          ImportModal, AddCaseModal, TestRunModal
```

Import aliases: `@shared`, `@platform`, `@modules`.

### Adding a module

Write a descriptor and register it. Nothing else in the platform changes:

```js
export const myModule = {
  id: 'my-module',
  label: 'My module',
  icon: 'boxes',                  // lucide, kebab-case
  basePath: '/my-module',
  navItems: [{ id: 'home', label: 'Home', icon: 'home', path: '/my-module/home' }],
  Routes: MyModuleRoutes,         // component rendering its own <Route> subtree
  matchNav: (pathname) => 'home', // which rail entry to light up
}
```

## The name

A **helix** is two strands running in parallel, bound at intervals, that together
carry information neither strand holds on its own. That is what this product is,
and it reads on two levels:

- **The documents.** The credit and the presentation are the two strands; the
  checks are the rungs binding them. An examination is only meaningful as the
  comparison between the two — neither read alone tells you anything.
- **The work.** The machine and the officer are the two strands. The engine
  extracts and proposes, the human decides, and the record is valid precisely
  because the two are bound together at every stage.

So the mark is two strands crossing, with three rungs, in the two brand solids —
one strand each, because they are peers.

`scripts/makeFavicon.py` generates the whole set from one geometry: `favicon.svg`,
a 16/32/48 `favicon.ico`, the touch and manifest PNGs, **and** `HelixMark.jsx` for
the sidebar wordmark. Generated rather than hand-drawn so the browser tab and the
app can never drift apart. Re-run it after any change:

```bash
python3 scripts/makeFavicon.py
```

Two details that decide whether it works: the strands are **depth-ordered** (x is
the cosine, the sine of the same angle is treated as depth, so each strand splits
into its in-front and behind halves and is drawn back-to-front) — without that you
get two crossing lines, not a helix. And the **rungs drop below 24px**, because at
16px three extra strokes turn the mark into a smudge and the crossing already
carries the meaning.

## Architecture notes

### Where the line between platform and module sits

`platform/` owns the rail, the content frame, the URL space and the registry —
and no domain vocabulary at all. The **case header** (breadcrumb, facts strip,
stage tabs, Ask / cost controls) lives in `modules/lc-check/`, not the shell,
even though the design draws it as chrome. It is entirely LC vocabulary; the
moment the shell knew what a credit was, the governance module could no longer
use it.

### lc-check: the officer-paced pipeline

Only intake is automatic. Every later stage waits for the officer, and the state
is split three ways so that pacing stays honest:

- `data` — what the service said. Replaced, never patched.
- `run` — progress of the current review run.
- `officer` — what this person has done but not yet submitted.

Nothing in `officer` is inferred from `data`, so the UI can never imply a
decision the person did not make. A finding also does not exist for the UI until
the area that produced it has returned — before that it has genuinely not been
found yet, rather than being hidden.

Two consequences worth preserving if these screens are rewritten:

- **Checks that did not run are visible and explained.** The plan lists what this
  credit does *not* trigger, with the reason. "We didn't check that" must never be
  something an officer discovers after signing.
- **Uncovered findings lead the review list**, under their own heading, so
  working top-to-bottom cannot leave the impression everything was checked.

### The rail lists products; a product owns how it subdivides

Two rows: LC check and Governance. Governance's four surfaces are its own top
tabs inside the module, not platform navigation — so the rail stays a list of
products and the two read as peers. `SideNav` renders any module with a single
entry point as a plain row, with no disclosure chevron.

### Plan & Execute shows the check, not metadata about it

A check in the plan is a governance artefact that gets compiled into a request to
a model, so the pane shows exactly that, in three tabs:

- **Rule** — the plain-language condition as authored in Governance, rendered
  through the same token highlighter the rule editor uses (`shared/lib/ruleTokens.js`),
  plus its severity, owning agent, UCP/ISBP references and a link into Governance.
- **Execution plan** — the markdown request that will be sent, through
  `MarkdownDoc`: rendered by default, **Source** one click away in the same
  CodeMirror the Governance module authors rules in. Not a summary of it — an
  officer accountable for the outcome has to be able to read the instruction the
  model was actually given.
- **Result** — what came back, or why it did not run.

Three groups in the list carry different weight and say so: checks from the
dictionary, checks **the planner wrote** for this credit's own `:47A:` conditions
(marked *Planner*), and checks **not run**, with the trigger that failed. A
condition the planner found but no rule covers is marked *not covered* rather
than quietly omitted.

### A finding is markdown, with a source view

Findings are what the model emits, so they are held and shown as markdown, in the
same `MarkdownDoc` as the execution plan — rendered for reading, source for
checking. Rendered markdown is genuinely easier to scan (headings, lists, the
quoted evidence in code blocks); the source view is there because the rendered
view is an interpretation and an officer signs off on the real thing.

The markdown always has the same four headings in the same order: **what the
credit requires · what was presented · why that is a problem · what you can do**.
A free-text blob makes the officer hunt for those four things and makes two
findings impossible to compare.

Two tabs, not three. *What we compared* was removed: the expected/presented pair
now lives inside the markdown, so the tab only repeated it.

The **Source pages** tab shows the credit's text on the left and, on the right,
the actual PDF page. It previously rendered `doc.lines`, which is empty for every
scanned document — an empty box.

### Naming: UCP's words for prose, plain words for labels

UCP 600 calls them *the credit* (art. 1) and *the presentation* (art. 2), and the
prose in this codebase uses those, because they are the terms of art an examiner
already thinks in. Labels, though, are read by people who have not memorised UCP,
so they name the artefact:

| Where | Label |
|---|---|
| Intake slot, rail group, viewer header | **Letter of credit** · **Presented documents** |
| Case header fact strip | **Documents** — `6 of 6 pages` |
| Extraction panel | `Extracted · letter of credit` |

Deliberately *not* used: **"credit letter"** (an inversion of the standard term —
no practitioner says it) and **"presentation document"** (a presentation *is* the
set of documents, so the singular misdescribes it). "Documentary credit" is
correct and interchangeable with "letter of credit"; "letter of credit" wins here
only because it is the more widely recognised of the two.

### Read: two kinds of document, two kinds of provenance

The Read stage follows the v3 examination UI's parse layout, which works in
practice: document rail │ source │ extraction, with a draggable divider because
officers size the fields panel to their screen. `PdfViewer`, `PageStrip` and
`ResizeHandle` are ports of that app's components onto the Memara tokens.

What the middle pane shows, and what provenance *means*, depends on the document:

- **The credit is text.** `mt700.js` splits the raw SWIFT message into one row per
  tag, so every field has a stable anchor. Hovering a value highlights the exact
  line it came from.
- **A presented document is a scan.** The bundle PDF has no text layer on most
  pages, so there are no character coordinates to highlight. A fact carries its
  page instead, and selecting it turns the viewer there.

That asymmetry is in the `Fact` contract (`anchorId` xor `page`) rather than
patched over in the view, because it is a real property of the data and the
backend will have the same one.

Both viewers render inside one `DocumentSurface`, and both draw their pages with
one shared chrome (`viewerChrome`): the same scroll container, the same zoom bar,
the same page sheet measured from the pane it was given, the same caption
underneath. The text viewer used to be a fixed 620px card centred in grey space,
which read as an overlay floating above the app rather than a document in a
viewer — and it changed width when you switched to a scan. Zoom on text scales
the type rather than the sheet, since text should reflow rather than magnify like
a bitmap. The surface fills to the bottom of the window
(`--case-header-h`, published by the workbench): dead air under a document viewer
wastes the one thing a reading screen needs.

**Pages scroll continuously.** Reading a presentation means moving through it, so
the PDF renders every page in one scroller; `page` is a scroll target rather than
a filter, and scrolling reports back which page is in view so the rail and page
strip stay truthful. A controlled-scroll guard stops our own scrolling from
feeding back as a page change.

Jumping to a page lands its **top edge** just under the toolbar, so reading starts
at the top and continues down. The offset is measured from the two bounding rects,
not `offsetTop` — offsetTop is relative to the nearest positioned ancestor, which
is not the scroller, and it was landing mid-page.

Three ways to navigate, because the right one depends on the bundle: chips for a
short one, arrows for stepping, and a **page number box** in the toolbar for a long
one, where an examiner usually already knows the page — it is written on the
finding they are chasing.

The **whole page bar collapses**, not the numbers inside it — the point is to
reclaim the row's vertical space and leave the scan viewer pixel-aligned with the
text viewer, which has no bar. It is a workspace preference (`usePageBar`,
localStorage), shared by every viewer in the app: an officer who does not want
that bar does not want it in Intake either. The control lives in the surface
header, which is permanent, because the bar it governs can be gone.

The PDF fits pages to its pane rather than a fixed width: real bundles mix A4 text
pages with small cropped scans, and the pane is resizable. Low-resolution scans
look soft when upscaled; that is the source, and it is the same softness the
extractor had to read through.

The page control offers the pages of the document being read — a packing list on
bundle pages 3–4 offers 3 and 4, not all six — with prev/next that deliberately
step past that range, because a segmentation boundary is exactly what an officer
needs to check.

The extraction panel follows `ui/`'s parse fields: label, mono value, confidence.
Colour is a claim that something needs attention, so it is spent only on that —
a chip when the extractor was unsure, nothing at all for a confident read, which
is the normal case. Source text is one toggle away per field.

Unlike the app it was ported from, the pdfjs worker is bundled rather than loaded
from unpkg, so the workbench works with no internet.

### The stage is in the URL

`/lc-check/cases/:caseId/:stage` — so a stage is linkable and the back button
retraces the review as the officer walked it.

### The API seam

`modules/lc-check/api/lcCheckApi.js` is the only place data enters the module.
Screens call it and never import fixtures; every function is async and returns
the shapes in `data/contracts.js`. Pointing it at the service is a rewrite of the
function bodies — no screen, prop or state change. The file documents the
endpoint each call stands in for (`/api/v2/sessions/...`), and `subscribeToRun`
already has the callback shape an SSE wrapper will have.

`data/contracts.js` is JSDoc rather than TypeScript on purpose: the platform is
JS end to end, and the annotations give editor completion and a reviewable schema
without forcing a migration of the governance module's ~3.5k lines alongside it.
It is the natural first file to convert if the project adopts TS.

### Governance: state and the URL

The module keeps its single-state-object design (`store.js` `initialState` +
`deriveVals(state, setState)` each render — a port of the design's
`DCLogic.renderVals()`). It owns `state.section`; the platform owns the URL, and
the two are synced in `GovernanceModule`. Section is seeded from the URL on first
render so a deep link renders its own section rather than flashing Checks first.

Checks are the unit of work, and there are two kinds of card:

| | What it is | How it runs |
|---|---|---|
| **Rule card** | Rows comparing a field on one document with a field on another — `Invoice value @ Commercial invoice` *is at most* `Credit amount @ Letter of credit`, with an optional qualifier — plus the wording to raise when it fails | deterministic, no model in the loop |
| **Requirement card** | Requirements in plain language, one per dash line, with dictionary field names braced (`{Expiry date}`, highlighted live) | read by the model, against a clause of the credit (46A, 47A) or the whole presentation |

Everything that isn't explicitly a rule is a requirement — that is what a check
is born as. `store.buildCheck()` turns a raw check into the props `Check.jsx`
renders; `Check.jsx` is the shell (id, title, severity, refs, which agent it
sits in) and fills its middle with `RuleCard` or `RequirementCard`. The same
card is reused in the Checks library and inside an agent's groups.

### The design system

Everything visual belongs here, and a module reaches for the component before it
writes a style object. The rule is narrow on purpose: **use the shared component
unless the design deliberately differs, and say so in a comment where it does.**
A one-off style is how a product ends up with four shadows and three radii on
adjacent panels.

| | What it is | Use it for |
|---|---|---|
| `Card` / `cardSurface(r)` | The white surface: one border, one shadow, two radii | Any panel, tile or list wrapper. `cardSurface` when it must be a `<button>` or carry its own layout |
| `Chip` | A lowercase data tag — `tone`, `size`, `mono`, `dashed`, `onRemove` | Field names, document types, filters, counts. `dashed` is the "+ add one" that ends a row of them |
| `Badge` | The uppercase **status** pill | One per row, saying what state a thing is in. Not a data tag — that's `Chip` |
| `Eyebrow` | The uppercase micro-label above a value or section | Every `LABEL` caption. `size="sm"` inside a card or menu, `md` above a panel |
| `IconButton` | A square button that is only an icon | Remove, close, expand, reorder. Always titled; `tone="danger"` reddens on hover only |
| `Menu` + `MenuItem` | The dropdown surface, outside-click and Esc included | Picking from a list the data supplies |
| `Select` | The native `<select>`, styled once | A short fixed list — it brings keyboard and typeahead with it |
| `TextArea` | The multi-line field: `maxLines`, `maxLength`, counter | Every editable prose field |
| `Button` | The pill button — `primary`/`secondary`/`ghost`/`danger`, `sm`/`md` | Any committed action |
| `Page`, `Toolbar`, `listWrap/listHead/listRow`, `SortHeader` | Page width tiers, the sticky section toolbar, list-table chrome, sortable headings | Section layout |
| `ellipsis`, `clampLines(n)` | Text-overflow styles | "This must not push the row wider" |

Plus the domain-neutral heavies: `PdfViewer`, `PageStrip`, `DocumentSurface`,
`Drawer`, `Modal`, `ConfirmDialog`, `Tabs`, `SegmentedControl`, `Switch`,
`Checkbox`, `SearchBar`, `ViewSwitch`, `Toast`, `Spinner`, `InfoTip`,
`RuleText`, `MarkdownDoc`, and the `Z` z-index ladder.

### One menu, one select

Every "pick one from a list" is `ds/Menu` — the surface, the outside-click and
Esc, and a `MenuItem` that always reads from the left. They had each been
hand-rolled, which is how they drifted; the shared item style set
`alignItems: center` for vertical centring in a row, and every call site that
stacked a label over a hint turned that into *horizontal* centring without
meaning to. `ds/Select` is the other half: a native `<select>`, which is right
for a short fixed list because it brings keyboard, typeahead and the platform's
own popup with it. Two components, so a dropdown cannot drift again.

### One open edit at a time

There is a single edit slot across the whole console. It had been three — a check
being edited, an article being written, and a just-added dictionary row that had
not been named — and none of them stopped you starting a fourth thing, so five
clicks of "New field" left five unnamed rows, each having silently taken the edit
off the last.

While the slot is occupied, every "New …" on every governance surface is blocked
and a notice beside the button names what is holding it: *"GEN-90 is unfinished —
Go to it"*. Clicking the notice (or the disabled button) scrolls to the item and
puts the caret back in it. Resolving it means **Save** or **Discard**; the
interface never picks for you, because one of those loses typing and the other
commits something half-written.

That single slot is also what makes focus predictable: whatever is created takes
the slot, takes the caret, and scrolls itself into view (`useNewItemFocus`).

**Leaving asks.** Switching section, opening an item, clicking into a different
card, or switching book while something is unfinished raises one question —
*"Leave without saving? GEN-90 has changes that have not been saved."* — with
**Keep editing** and **Discard changes**. Saving on your behalf is not offered,
because what you were writing may not be saveable yet. Say discard on a record
this edit created and it goes entirely; on one that already existed it goes back
to its snapshot. Rows that another edit is blocking are `readOnly`, so you cannot
type into two things at once and then wonder which one you were in.

**Every editor works this way**, and that is the point: a check card, a rule
card, a dictionary field, a document type and a library article all take a
snapshot on first change, all show the same footer, and all use the same three
words — Save, Cancel (revert), Discard (un-create). The dictionary was the odd
one out, mutating the store on every keystroke, which also made "discard your
changes" impossible to honour: there was nothing to go back to.

### Where a new item lands, and how you get rid of it

A new item goes where you will look for it next, which depends on whether its
position means anything:

| | Where | Why |
|---|---|---|
| Checks, dictionary fields, document types, books | **Top** | Order is whatever you sorted by, so the new one leads. You clicked "new" — it should be under your cursor |
| Agent groups, a book's sections and articles | **Bottom** | Order *is* the content: a group's sequence is its run order, and UCP 600 art. 6 comes before art. 14 because that is the book. Prepending an article would claim it is article 1 |

For the reference library specifically: nav and body are two projections of one
list, so they cannot disagree about where a new article went — and the answer to
"appending makes it hard to find" is not to move it, it is to go to it. A new
article opens for editing, takes the caret and scrolls into view, and a section's
own `+` appends within *that* section rather than at the end of the book, which
is both order-honest and near where you were reading. (Inserting at an arbitrary
position would need drag-to-reorder; not built.)

In both cases the new item takes the caret and scrolls itself into view, and is
outlined until it is named. Putting it on top only solves half the problem — the
page may not be scrolled to the top either. Sorting is also suspended while an
item is being added, because a row that reorders itself out from under you as you
type its name is worse than an unsorted list.

Two words for two outcomes:

- **Discard** — on an item created by this edit. It never existed, nothing cites
  it, so it goes with no confirm. Cancel used to leave a just-created card
  behind as a draft, which read as "created it anyway".
- **Cancel** — on an item that existed before the edit. Reverts the typing.
- **Delete** — on a committed item, and still guarded: a draft that never ran can
  go; anything that has examined a case is retired instead.

### Sort the list, group the cards

A list is read column by column, so its headings sort (`ds/SortHeader`; caret on
the active column only — an idle up-down arrow on all five headings is five
pieces of chrome saying "you could click me", which the pointer already says).
Clicking the sorted column reverses it, clicking another starts it ascending.

Cards don't sort usefully, because you never see two at once to compare. What
helps there is **grouping**: by kind, severity or agent, each with a count and a
sticky heading. It turns one long scroll into a few named runs, so "where am I"
has an answer. Sorting still applies inside each group.

### One measure per surface

Governance's four sections sit under one tab bar, so they share one width (1240)
— and so does the tab bar itself. They had drifted to three tiers, which made
switching tabs shift the frame and read as a layout bug. Where a single card has
no use for the full width, the page keeps the tier and the card caps itself: the
frame stays put, the content decides its measure.

### A rule card is a form, and it behaves like one

Its structural controls (add a condition, add or remove a block) appear only
while editing, so a saved rule reads as a statement. **Edit rule** in its header
is the way in — before that, the only way to start editing was to click into a
field, which left a finished rule with no way to add anything to it. On the way
out: **Cancel** restores the conditions as well as the title, and **Save** is
held back while the rule is missing something it cannot run without, with the
reasons printed next to the button rather than a disabled control and no
explanation. A block emptied of its conditions removes itself, and the last
condition of the last block is replaced rather than deleted — a rule with
nothing to compare is not a rule.

### The dictionary names business fields, not LC tags

A field is a plain business name — *Latest shipment date*, not `44C` — with a
list of the documents it can be read from. Each of those bindings carries one
note saying what the field is called on that document and how to read it
(`Tag 44C, or derived from the 44D shipment period`; `Actual flight-date
notation — not the issue date`). That note is the whole extraction instruction,
and it is what makes the credit just one more document rather than a privileged
vocabulary. Checks reference a field by its name, both in a braced token and as
a rule operand, so renaming one is a dictionary edit with a usage count beside
it rather than a hunt through the catalogue.

### A check varies along two axes, not one

Conflating them is what made the plan screen read as nonsense: a group called
**Requirements** (an agent's domain) sat next to a badge called **Requirement** (a
kind of card), and they are not the same thing.

| | | Answers |
|---|---|---|
| **Source** | the credit · UCP 600 & ISBP 821 · bank policy | *what am I held to, and by whom?* |
| **Kind** | Rule · Requirement | *how was it settled, at what cost, how far can I trust it?* |

They cross freely. "Shipment on or before the latest date" is the **credit's**
requirement (field 44C) settled **deterministically**. "Goods description
corresponds" is also the credit's (field 45A) but needs **judgement**. "No
documents beyond those called for" is **practice** (ISBP A31) and needs judgement.
"Parties screened" is **policy** and is not a UCP discrepancy at all.

**Kind groups the plan**, for two reasons that have nothing to do with which axis
is more interesting:

- **It needs no expertise.** "The system computes these, an agent reads those" is
  legible to anyone. Grouping by source asks the reader to already know why field
  46A and article 20 are different kinds of authority — precisely the knowledge a
  new checker has not got yet.
- **It is the same on every deal.** There are always exactly two groups. Source
  groups appear and vanish with the credit, so the page moves under you from one
  case to the next and nothing is where you left it.

**Source is the *Cited as* column** — the domain knowledge is there for whoever
wants it and costs nothing to whoever does not. Classification follows where the
*content* of the obligation sits, not which article describes how to examine it:
"documents required by field 46A not presented" cites the credit; UCP 14(a) is the
standard applied, not the requirement applied. Structure by what everyone can
read; put what experts need in the data.

The group header **is** the kind indicator, and it carries that kind's economics
and its policy — so nothing has to be repeated per row and no summary block sits
above the plan eating the space the plan needs.

Two things that are neither axis, and so are their own groups: **Added by you**
(provenance — the officer's, not the credit's) and **Not brought into play**
(status — trigger unmet, listed so "we did not check that" is never discovered
after signing). There is no need for an "other" kind: what looks like one always
resolves into source, kind, or provenance.

### The plan is a table, and it takes the width

One line per check, the whole plan at once, rows comparable down a column — which
is what "overview" means and what a 380px rail cannot give you. Selecting a check
opens it *beside* the list, not instead of it: reading the plan and studying one
check are different jobs and the screen should not make you choose. Close the panel
and the list is full width again.

| | |
|---|---|
| **What it reads** | For a rule, the comparison itself — `On-board date ≤ Latest shipment date`. A rule's whole claim on your trust is that you can read it; behind a click it is a label with nothing under it. For a requirement, the credit fields it is handed. Same column, same question. |
| **Cited as** | The article or the policy. This is the source axis, as data. |
| **State** | planned · queued · running · passed · discrepancy · **needs a field** · not covered |

Where both sides of a comparison name the same field, the *documents* are the
comparison — so they are named only then. "Goods description no conflict with Goods
description" says nothing; `Goods description @ Commercial invoice no conflict with
@ Letter of credit` says the thing.

Not-brought-into-play collapses to one line: it is reference, not work.

### Two kinds of check, one execute step

Governance authors two kinds of card, and they are executed by different things:

| | Executor | Cost | Reproducible | What you read to trust it |
|---|---|---|---|---|
| **Rule** | the system, over extracted fields | ≈0 tokens, ms | byte-identical | the rows, and the values it read |
| **Requirement** | an agent, over the presentation | tokens, seconds | no | the prompt, and the reasoning |

The pipeline did **not** gain a stage for this. A deterministic pass is not a step
in the sense the other steps are: pacing exists to make model work observable,
and there is nothing to observe in six expression evaluations. Adding
`verify`/`examine` would have made an officer track four stages to understand a
division of labour that belongs to the checks themselves. So `interpret → plan →
execute` stands, and the difference lives where the checks live:

- the **kind is marked on every plan row**, in the same badge Governance uses
- the **header states each half's economics**: *6 evaluated on extracted fields —
  no model, no cost* / *16 read by an agent — about 78k tokens*
- rules **lead their group** and settle in the tick the run starts, because you
  do not queue work that takes no time behind work that does

**The plan can now say what is answerable before anything is spent.** A rule
consumes fields Interpret produced, so its readiness is knowable in advance: a
blocked rule names the field it is missing and says what will happen — *reported
as not covered, never as a pass*. A missing input is not evidence of compliance.

`CheckSpecCard`'s middle tab follows the kind. A rule has no request to read —
nothing is sent anywhere — so its equivalent artefact is **Inputs**: each operand,
the document it was read from, the value found, and the confidence. Same promise
(*you may read what the system judged on*), the artefact that actually exists.

### Plan is coverage; Review is decisions

They look like the same results table after a run, and they are not. **A check is
not a finding**: one check can produce none, one or several, and a finding can exist
with no check behind it at all — which is the whole reason Review leads with "Not
covered".

| | Shows | Answers |
|---|---|---|
| **Plan / Execute** | all 25 checks, complete — including the ones that passed, the ones that could not be answered, the ones never brought into play | *did you check X?* — the question asked in a dispute, years later |
| **Review** | only what needs a person, worst first, with evidence and the officer's call | *what do I do about each of these?* |

So the plan screen does **not** grow disposition buttons. Three of them on 25 rows,
14 of which need nothing, would invite an officer to work top-to-bottom through a
list that is mostly noise — exactly the failure Review's ordering exists to prevent.
Instead, once the run produces anything the plan states its coverage
(*14 passed · 2 could not be answered · 3 not brought into play*) and hands over:
**3 findings need your decision →**.

### Review is shaped like the plan, on purpose

Same groups, same two densities, same words — learning one screen should teach you
the other.

**Grouped by kind, by default**, for the reasons it groups the plan: no expertise
needed to read it, the same on every credit, and it is the most useful sweep an
officer has (rule findings are arithmetic and go quickly; agent findings are where
the reading time belongs). **Not covered leads**, always, under either grouping —
an officer must not be able to work top-to-bottom and come away thinking everything
was checked.

**One alternative, not three.** *By review area* is gone: an area is which of our
agents ran the check — a fact about our implementation that means nothing to a
reader who does not know our agent names. *By document* stays, because it answers a
question an examiner actually asks ("what is wrong with the bill of lading?") and it
is a thing you can point at on a desk.

**Two densities.** Nothing selected: the whole findings list, one line each, with
**Your call** as a column so progress is readable without opening anything — blank
says *needs you* rather than nothing, because an empty cell is work outstanding.
Selecting one: the list becomes a 340px rail and the finding gets the room. It used
to auto-select the first item, which saves a click and costs the overview.

### "Not covered" was never a category

If a finding belongs to no rule card and no requirement card, where did it come
from? It used to be a group in Review, and that was wrong. The answer is that the
planner read a condition out of the credit and found nothing in the dictionary that
covers it — so it **is** a requirement, one we have no card for. Making it a category
dressed a **gap in the catalogue** up as a legitimate third kind of finding.

It is now a flag, and the two gaps behind it are told apart because they call for
different fixes:

| | Means | Fix |
|---|---|---|
| **no card** | nothing in the dictionary covers this | author a card in Governance |
| **not settled** | a card ran and could not conclude, so it handed the question to a person | the card is too weak, or the data was not there |

Both lead their group, because both are the engine admitting something, and an
officer must not be able to work top-to-bottom and come away thinking everything was
checked.

The third group is **provenance, not kind**: *Raised by you*. Not "user" — this
interface speaks in the first person — and not "manual", which in trade finance
means a person examining documents and would make the label sound like the whole
job. So: **Rule · Requirement · Raised by you**.

### Two tiers, told apart

The mode (*Findings* / *Examine the documents*) changes what you are doing. The
grouping (*Kind* / *Document*) arranges one list inside one of those modes. Both
were segmented controls, adjacent and equal-weight, which read as one tier and
then said nothing about which was which.

The fix is placement, not decoration: **a control that arranges a list belongs on
the list.** The mode stays in the screen header, alone at that level; the grouping
moved into the findings list's own header, smaller, labelled *Grouped by*. Nothing
is ambiguous about a control's scope when it sits on the thing it scopes.

### Examine the documents yourself

The engine's findings are a head start, not the examination. Under UCP 600 art. 14(a)
the *bank* examines the documents; a list of what our checks happened to look at is
not that. Three things a finding list structurally cannot cover:

- OCR read a box wrong, or could not read it at all
- we read the right box and drew the wrong conclusion
- the credit states something no card covers

So Review has a second **mode** — not a grouping, because neither job contains the
other. *Findings* is checking what we found; *Examine the documents* inverts the flow
to document-led.

But document-led is not one-document-at-a-time-in-isolation, which is what a first
pass at this was and what no examiner does. **An examiner holds the credit's
requirement in one hand and the document in the other.** They do not read a bill of
lading and then wonder what to think about it — they read it *against* the 46A item
that called for it, the fields it must agree with, the 47A condition that touches it,
and the article that says how to read it. So the layout is the desk:

```
[ credit ] [ invoice ] [ bill of lading ] [ packing list ] …     ← documents, across the top
┌──────────────────────┬───────────────────┬──────────────────┐
│ What the credit      │  the page         │ What we read     │
│ demands              │                   │  · our doubt     │
│  · called for by 46A │                   │    first         │
│  · must agree with   │                   │  · everything    │
│  · conditions in 47A │                   │    else          │
│  · read it under     │                   │  · findings here │
└──────────────────────┴───────────────────┴──────────────────┘
```

**Segmentation is a guess, so it must not be a cage.** The document tabs say what a
page *probably* belongs to; every page of the bundle stays one click away regardless,
and when you page past a boundary the tab follows the page rather than the two
silently disagreeing. A segmentation error is exactly the thing an examiner needs to
be able to catch, and the first pass at this clamped paging to the selected
document's own range — which would have hidden it.

**The two side panels are a pair, not two lists.** Left is *Required by the credit*
(the 46A item, the credit's own fields with their `:tag:`, the 47A conditions, the
articles); right is *Read off this document*. They were indistinguishable because
both were labelled values, so each credit requirement now carries what this page
answers with directly beneath it:

```
Amount · :32B:
USD60000,00 ±10% (:39A: 10/10)
  │ on the document   USD 56,000.00
```

The comparison is the examiner's whole act. Splitting it across two panels for them
to hold in their head was the mistake.

The credit column is **filtered to what bears on the document in front of you**.
Showing the whole credit beside every page would be technically complete and
practically useless — the examiner would filter it in their head, every time. It
opens on the first *presented* document, not the credit: examining is reading what
was presented against what was demanded, and landing on the credit puts you on the
instrument rather than the subject.

**Our own uncertainty is promoted to the top of that panel**, and that is the whole
idea. We already record a confidence per reading and a flag when something looked
odd; buried in a list, that is a risk nobody reads. Surfaced as *"2 readings we are
not sure of"*, it becomes a directed task — the shortest path to the discrepancies
our extraction is likeliest to have fumbled. On case 01 that is 8 readings across 7
documents, one of which ("Drawee", faint scan) we could not read at all.

Every reading carries **Raise** — not only the doubtful ones, because a confident
misreading is still a misreading and the officer decides which of our readings to
trust.

**Raising happens in the column, beside the evidence.** It was a dialog for one
revision, which covered the two things an officer is actually looking at while they
write — the page and the credit's terms. A form that hides its own evidence is the
wrong shape however roomy it is.

It is **one box**: two lines to start, as many as it takes, and the first line taken
as the headline because that is how people write anyway. It pre-fills the document,
page and quote from where you were standing — a finding whose provenance was typed
from memory is worth less than one the interface recorded. Two chips for severity
rather than a select, because there are two answers and a select costs a click to see
them.

It defaults to **To decide**, not Discrepancy, and the asymmetry is the reason: a
discrepancy that should have been a query gets stated in a refusal notice under UCP
600 art. 16(c) and has to be defended, while a query that should have been a
discrepancy gets looked at again ten minutes later. One of those is recoverable and
the other is not, so the default is the recoverable one — with the other one click
away at equal weight.

**Everything below the raise action is reference.** Unsure, Extracted, Findings here —
in that order, informing the judgement without competing with it. Our extraction is
not what an officer looks at while deciding; the document is.

### A finding carries how it was settled

`settledBy` (rule or requirement), `source` (credit / practice / policy), and for a
computed finding the `comparison` — each row with the values actually compared,
where each was read, and which row failed. That is the evidence for a rule finding,
and it *replaces* the model's reasoning because there is none: nothing formed a
view, two values were compared. Checking such a finding is checking a sum, which is
quick — and labelling it "model output" would have been a lie.

`statementSource` says where the discrepancy wording came from:

- **derived** — the rule's own *Raise* line plus the real values. Exact, reproducible,
  no hallucination risk.
- **drafted** — the agent wrote it. Needs the officer's eye before it goes on a
  refusal advice.
- **officer** — raised by a person, no check behind it.

### Stopping on a rule failure is a policy, not a surprise

A critical failure found by arithmetic is exactly the case where reading on may be
waste: if the invoice overdraws the credit, the presentation is refused whatever
:47A: says. But some banks want the complete picture for a waiver request, so it
is a **choice made in the plan** — a checkbox next to the estimate, before you
press go. That keeps Auto's promise: it never stops on you unless you asked it to.

When it fires, the plan says what was skipped and what that saved, and offers both
ways out: *Read on anyway* or *Take it to the report*.

### Run modes, and why not "Manual"

**Auto** runs every area straight through; **Step** pauses after each one. The
primary button is for advancing the *run*, never for moving between stages — the
stage tabs do that — so in auto mode it disappears once the run is going, instead
of offering a "Next" that did nothing the officer needed.

Not called **Manual**, though it was the obvious candidate: in this domain *manual
examination* already means a human checking documents without AI. Labelling a
pacing control "Manual" would collide with the one distinction the product exists
to make clear.

### Explaining a term: one component, three triggers

`InfoTip` is the only way this app explains a metric or a term. Two decisions in
it are worth keeping.

**Not `title=""`.** Native tooltips look free and are not: roughly a second of
delay, no styling, long text truncated by the platform, nothing at all on touch,
and inconsistent screen-reader behaviour. These explanations run to two or three
sentences and cite UCP articles — that is popover content.

**Not hover-only, and not click-only.** Neither serves everyone. Hover is fastest
when scanning a dense grid with a mouse; a touch user has no hover and a keyboard
user never reaches it. Click works everywhere but is slow when checking six
definitions in a row. So it opens on **all three**, which costs nothing:

| Gesture | Behaviour |
|---|---|
| hover | opens after 120 ms, closes on leave |
| focus | opens — keyboard reaches it by Tab |
| click / tap | *pins* it open, so it survives the mouse leaving while you read |
| Esc, outside click, second click | closes |

Two presentations, chosen by density: `trigger="underline"` makes the label
itself the trigger (dense grids, where a column of `?` icons would be more chrome
than data), `trigger="icon"` renders a `?` (a heading, or anywhere with no
natural word to underline). Positioned `fixed` from the trigger's rect, because
these live inside panels with `overflow: hidden` that would clip an absolutely
positioned bubble.

### Cost is attributed per model

A run is not one model: a vision model reads the pages, a cheap text model plans
and routes, the main model executes the rules — at prices an order of magnitude
apart. A blended total hides the only thing worth knowing. `runCost.js` prices
each step against its own model's rates and rolls up per model; the cost drawer
tabs into **Summary / By model / By step**.

On the worked case that reads: Claude Sonnet 4.6 is 88% of spend, GPT-4o reading
six scanned pages is 11%, and Qwen3 32B planning and routing is 2%. That is a
decision you can act on; `$1.19` on its own is not.

### Check references

A check id is quoted in a refusal advice, in an audit file and in a dispute years
later, so it has to be stable, unique and self-describing. `CHK-01` was none of
those, and the governance dictionary had drifted into its own scheme (`CHK-AVL`,
`CHK-BL`). Both now use one format, defined in `shared/lib/checkId.js`:

```
<CONCERN>-<ANCHOR>[.<clause>]

DATE-44C      latest shipment date            (dictionary)
AMT-30A       amount within tolerance         (dictionary)
COND-47A.2    second clause of field 47A      (written by the planner)
USER-01       added by an officer on a case
```

`ANCHOR` is the governing MT700 tag or UCP/ISBP article fragment, which is what
makes the id self-describing: `DATE-44C` says both *a date check* and *the one
that reads field 44C*. The clause suffix means a planner-authored check announces
its provenance in its own id. `checkIdOrigin()` recovers dictionary / planner /
officer from the id alone.

Concerns follow the backend's rule catalogue: REQ, DOCSET, DATE, AMT, GOODS,
TRANS, CERT, COND, XD, PARTY, GEN, USER. Adding one is a governance decision.

Every finding carries the id of the check that produced it, or explicitly none —
an uncovered condition must not borrow one.

### A finding has three levels, and they are different artefacts

- **Title** — a readable headline. *"Shipment is two weeks later than the credit allows."*
- **Statement** — the formal one-liner that would go out in the refusal advice
  (MT734 field 77J), monospace and upper case because that is how it appears on
  the wire. *"LATE SHIPMENT — B/L ON BOARD 14 JAN 2025, CREDIT REQUIRES SHIPMENT
  NOT LATER THAN 31 DEC 2024."*
- **Analysis** — the markdown reasoning, four fixed headings.

They are not three sizes of the same text. The statement is the line an officer
has to defend, so it is what the decision list is scanned by.

### Title Case for names, sentence case for everything else

Anything that **names** a region of the interface is Title Case: panel and section
headings, drawer and dialog titles, tab labels, column headers, group labels,
status and severity labels, review-area names and document type names. So
**LC Check**, **AI Performance**, **Bill of Lading**, **Presentation to Decision**.

Proper title case, which means minor words stay lowercase — *Letter of Credit*,
not *Letter Of Credit*; *Kept off the Bill*, not *Kept Off The Bill*.

Sentence case stays for everything that is not a name: helper text, tooltip prose,
unit captions under a figure (*pages read*, *per case*), tooltips and aria-labels
(*Previous page*, *Copy markdown*), and action labels phrased as sentences
(*Start the review*, *Not one*). Those are instructions or values, not titles, and
title-casing them makes an interface shout.

### Naming panels

A panel, section or drawer title is a **short noun phrase** — the name of the
thing. Anything that explains moves to a meta line, helper text or a tooltip. The
titles were drifting into sentences (*"What this case cost to run"*, *"Where each
finding stands"*, *"The plan for this credit"*), which reads as prose rather than
as an interface and gives an officer nothing to refer to in conversation.

| Panel | Was | Is |
|---|---|---|
| Cost drawer | What this case cost to run | **Run cost** |
| Assistant | Ask about this case | **Assistant** |
| Check plan | The plan for this credit / Working through the checks / All checks are back | **Check plan** (status moved to meta) |
| Decision list | Where each finding stands | **Dispositions** |
| Routing card | Where this goes | **Routing** |
| Extraction panel | Extracted · letter of credit | **Extracted fields** (document moved to meta) |
| Check spec fields | Applies to this credit because / The rule as written | **Trigger** / **Rule** |
| Plan payload | Sent to the model | **Model request** |
| Finding groups | Needs your own review — we did not cover these | **Not covered** |
| Plan groups | Written by the planner for this credit / Not run for this credit | **Planner-written** / **Not applicable** |
| Marks | Signatures, stamps & handwriting | **Signatures & stamps** |

Sentences that stayed are the ones that should: tooltips, verdict choices
(*"Refuse the presentation"* is an action, not a heading), switch labels, and data
field names.

### Run cost is one column, not three tabs

The tabs implied three equal bodies of data and these are not equal: the totals
are three numbers, the model breakdown is the part that changes decisions, and
the step list is reference detail most people never open. Tabs also hid whichever
section was empty, when *"we did not record that"* is itself worth seeing.

Now one scroll with named bands — **Totals · Coverage · By model · By step · Run
detail** — each rendering only when it has data and saying so when it does not,
rather than a grid of em-dashes.

### Nothing moves because of a scrollbar

`scrollbar-gutter: stable` on `html`. Anything that grows the page — expanding a
decision row, a run returning findings, the facts strip rewrapping — used to make
the scrollbar appear, narrow the viewport by its width, and shift every column
sideways. The gutter is now always reserved.

The same class of bug inside a row: the disposition label changes from *Open* to
*Not one* as the officer decides, and a shrinking label slid the chips out from
under the cursor mid-click. That column is fixed-width, as is the expand/collapse
control whose word also changes.

### AI performance on the cases list

The per-case drawer answers *what did this one cost*. The cases list makes the
value argument, in the order that convinces: **what you get · what it costs · how
good it is**.

```
TURNAROUND              SPEND                     QUALITY
3 min 12 s              $4.28                     92%
median to findings      total for the period      383 of 417 upheld
24 pages · 82 checks    $1.07/case  $0.18/page    34  raised, not upheld
41 findings evidenced   $107 per 100 cases         3  MISSED
6.2 h to decision       ▉▉▉▉▉ 97% Sonnet          86% conditions covered
74% of window free      kept off the bill $1.09
```

The title is **AI performance** and nothing cleverer. A draft called it the
*pre-check*, which is a coinage — it needs a sentence of explanation before the
panel can be read, and a title that has to be explained has failed. Every other
word in the panel is already in the product or in UCP 600.

**There is no comparison against examiners anywhere in this panel, deliberately.**
An earlier version scored the assistant against 45 minutes of unaided
examination. Two things were wrong with that. It is wrong about the product — this
is a pre-check that decides nothing, and framing it as displacing the people who
sign the work makes it unusable in the room where it gets shown. And it was
resting on an estimate of how long review takes, which was the least reliable
number available and was carrying the entire claim.

So value is stated from the system's own side:

- **Turnaround leads**, because being decision-ready before a case is opened is
  the thing the assistant actually delivers. The supporting numbers are work
  completed — pages read, checks run, findings evidenced.
- **The run takes minutes, and says so.** Step durations describe the work: a
  vision model reading six scanned pages is over a minute on its own, and the
  `:47A:` conditions run an agentic loop. Six pages and twenty-odd checks come to
  ~6 min of agent time, ~3 min on the clock. The animated run on screen is faster
  — nobody demos a three-minute spinner — but every reported number comes from the
  step table. `duration()` picks its own unit, so nothing reports `192.0s`.
- **The total is labelled as a total**, because that is the number a budget holder
  gets asked for. Unit costs sit beneath it, since a total only ever rises and so
  cannot show a regression, plus a per-100-cases rate to forecast with.
- **Headroom, not raw speed.** UCP 600 art. 14(b) allows five banking days; pace
  stops being worth anything once the window is comfortable, so the figure is how
  much of it the slowest case left free.
- **Savings are real money not spent, not time attributed to anyone.** The extract
  cache serves a document already read without re-rendering or re-calling the
  model, and prompt caching discounts repeated context. `costAvoided` is derived
  from the same usage as the spend, so the two reconcile — an avoided figure
  nobody can check is worth nothing.
- **Quality is measured as a detector, and never as "accuracy".** A discrepancy
  checker has the four outcomes a detector has, and three are worth counting:
  true positives (raised, upheld), false positives (raised, set aside) and false
  negatives (real, missed). The fourth — every check that correctly found
  nothing — numbers in the thousands, so plain accuracy is dominated by the
  outcome nobody cares about and would read **99%** while three real
  discrepancies went out the door. So the panel reports:

  ```
  precision = TP / (TP + FP)   92%  +4.0 pts   of what we raised, what stood
  recall    = TP / (TP + FN)   99%  +1.0 pts   of what was real, what we caught
  ```

  The two are not equally important and the panel says so: a false positive
  costs an officer minutes, a false negative can cost the drawing, because
  art. 16(f) turns a missed refusal window into a lost refusal right. Recall is
  the number to defend; precision is the number to improve.

- **Every figure carries the previous period**, because one month's precision
  says nothing about whether the rulebook is improving.

  **The arrow points up when the measure improved** — never at the raw number's
  direction — and the colour says the same thing. Up is better, green is better,
  always. An earlier version pointed the arrow at the raw movement and coloured
  it by whether that movement was good, so a falling false-positive count showed
  a green *down*-arrow beside rising precision's green *up*-arrow. Both were good
  news and they looked like opposites; the reader had to identify the metric
  before the arrow meant anything. Two encodings fighting each other.

  Nothing is lost by it: the magnitude reads "13 fewer" or "2 more", the previous
  value is printed inline (*was 47*), and the column header states the convention
  once — `↑ better vs previous 30 days`.

  `lowerIsBetter` is declared per call site rather than inferred from the label,
  because getting it wrong is silent and reverses the meaning of the panel.

- **Recall is listed before precision**, against the usual convention, because it
  is the one to defend here. Ordering by convention would have put the less
  important number on top.

- **F1 is computed and deliberately not shown.** It is the harmonic mean of the
  two rates, which collapses them into one number — the same mistake as accuracy,
  for the same reason.

- **Every value has a tooltip explaining what it measures.** An unexplained
  metric in a governance panel is worse than no metric: someone will quote it in
  a meeting having guessed at the definition. *Presentation to decision*, for
  instance, is elapsed end-to-end time including queueing and review — not
  machine time — and only the tooltip can say that.

### Deleting a check is usually the wrong answer

A check id is quoted in the findings it produced and in any refusal advice
quoting them; a dictionary field is read by rules, and those rules are compiled
into the prompt sent to the model. Deleting either breaks something downstream
that no longer has a way to say so. So:

| Thing | Deletable | Otherwise |
|---|---|---|
| Check that never ran (draft) | yes | — |
| Check that has examined a case | **no** | *Retire* — stops running, record stays readable |
| Field read by ≥1 check | **no** | edit those checks first |
| Document type ≥1 field extracts from | **no** | reassign those fields first |

`ConfirmDialog` grew a `blocked` mode for this: a refusal is not a confirmation,
so it has no destructive button, explains the actual consequence, and — where
one exists — offers the safe alternative as the primary action.

### The id leads

In the checks list and on the check card, the id comes before the title. In an
enterprise system the id is the stable handle: titles get reworded during review,
ids are cited in advices and audit files and must never change. Sorting the eye
to the id first also makes the list scannable by the thing people actually quote
to each other.

### One severity vocabulary

`shared/lib/tone.js` holds the tone palette both modules grade against — a
governance check has a severity, an LC finding has a disposition, and they must
be coloured identically or the UI stops reading as one system. `severity.js` in
lc-check maps its domain values onto it.

## Source

Both modules were imported from claude.ai/design projects on the *Memara
Enterprise* design system:

- **LC Compliance Flow** (`LC Compliance Flow.dc.html`) → the platform rail and
  the lc-check module
- **LC Compliance Governance Console** (`LC Governance Console.dc.html`,
  `Check.dc.html`, `ReviewPanel.dc.html`) → the governance module
