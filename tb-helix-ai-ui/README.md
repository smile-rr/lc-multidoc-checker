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
│   ├── ds/                  design system (Button, Badge, Icon, Drawer, Modal,
│   │                        Overlay, Tabs, SegmentedControl, Toast, Spinner,
│   │                        Select, Switch, Checkbox, SearchBar, Toolbar, Page,
│   │                        ConfirmDialog, ViewSwitch, PdfViewer, PageStrip,
│   │                        ResizeHandle, DocumentSurface, RuleText,
│   │                        MarkdownDoc + MarkdownSource, z-index ladder)
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
        ├── components/      Check, CheckRow, AgentCheckRow, ReviewPanel, RuleEditor
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

Checks are the unit of work: a plain-language note with a severity, LC field
codes (`{41A}`, highlighted live), document types and UCP/ISBP refs.
`store.buildCheck()` turns a raw check into the props `Check.jsx` renders, and
the same card is reused in the Checks library and inside an agent's groups.

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

- **Every figure carries the previous period.** One month's precision says
  nothing about whether the rulebook is improving. `Delta` inverts its colour for
  lower-is-better measures — a falling false-positive count is good news and a
  falling recall is not, and getting that backwards would be worse than showing
  no trend at all.

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
