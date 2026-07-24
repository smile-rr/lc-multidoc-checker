# lc-govenance-ui — LC Compliance Governance Console

Front-end for the **LC Compliance Governance Console**: where officers curate the
plain-language *checks*, group them into *domain agents*, maintain the field/
document *dictionary*, and read the UCP 600 / ISBP 821 *reference library* that the
v3 examination pipeline runs against.

This is the **governance / authoring** surface (sibling to the examination `ui/`).
The backend service is added later; today all data is in-memory mock data.

## Stack

- React 18 + Vite 5 (JSX, no TypeScript)
- `lucide-react` for icons
- Ported from the claude.ai/design prototype **"LC Compliance Governance Console"**
  on the *Memara Enterprise* design system. Design tokens (colours, type, spacing,
  effects) live in `src/tokens.css`; the DS primitives are in `src/ds/`.

## Run

```bash
npm install
npm run dev      # http://127.0.0.1:5174
npm run build    # production build → dist/
npm run preview  # serve the built dist/
```

Port **5174** is chosen to avoid clashing with the examination `ui/` on 5173.

## Layout

```
src/
├── main.jsx              entry
├── App.jsx               shell: top-level section tabs + review drawer + modals
├── store.js              ported state + view-model derivation (deriveVals) + seed data
├── tokens.css            Memara design tokens (CSS variables)
├── index.css             globals
├── ds/                   design-system primitives
│   ├── Button.jsx  Badge.jsx  Switch.jsx  Select.jsx  Checkbox.jsx  Icon.jsx
├── components/
│   ├── Check.jsx         the editable check card (ported Check.dc.html)
│   └── ReviewPanel.jsx   the comments/review drawer (ported ReviewPanel.dc.html)
├── sections/
│   ├── ChecksSection.jsx     Checks library
│   ├── AgentsList.jsx        Domain agents — gallery / list
│   ├── AgentDetail.jsx       Agent — "Checks & groups" + "Scope & configuration"
│   ├── Dictionary.jsx        Fields + document types
│   └── Library.jsx           Reference library — shelf + reader
└── modals/
    ├── ImportModal.jsx  AddCaseModal.jsx  TestRunModal.jsx  Overlay.jsx
```

## Architecture notes

- **Single state object.** `App` holds one console state (`src/store.js`
  `initialState`) and calls `deriveVals(state, setState)` each render to produce the
  full view-model the sections consume — a direct port of the design's
  `DCLogic.renderVals()`. `setState` merges a partial or an updater function, like
  the original design runtime.
- **Checks are the unit of work.** A check is a plain-language note with a severity,
  LC field codes (`{41A}` etc., highlighted live), document types, and UCP/ISBP refs.
  `store.buildCheck()` turns a raw check into the props `Check.jsx` renders; the same
  card is reused in the Checks library and inside an agent's groups (drag-to-regroup).
- **Agents** compose checks into ordered groups; the detail view is wired to the
  "Expiry & Availability Review" agent (as in the source prototype).
- **Mock data only.** Seed agents/checks/books/fields are constants in `store.js`.
  When the backend lands, replace the seed constants + the `set*` handlers with API
  calls; the view-model shape (`deriveVals`) can stay.

## Source

Imported via the claude.ai design MCP from project
`LC Compliance Governance Console` (`LC Governance Console.dc.html`,
`Check.dc.html`, `ReviewPanel.dc.html`).
