# Package layout — `tb-helix-ai-svc`

Where a class goes, and why. This is the authority for the backend; every rule below has a matching
test in [`ArchitectureTest.java`](../../tb-helix-ai-svc/src/test/java/com/tb/helix/ArchitectureTest.java),
because a convention nobody can fail is a convention that decays.

Derived from `architecture-package-guideline.md` at the repo root, with three deliberate departures —
see [§7](#7-where-this-departs-from-the-generic-guideline).

---

## 1. The four layers

```
infra       bytes, rows, sockets. Blob storage, cache tiers, streams, errors, config.
            Knows nothing about documents, models or letters of credit.

harness     domain-neutral capability. Convert a document, render a page, route to a
            model, run a capped tool loop. Knows about documents and models; knows
            nothing about letters of credit. The layer another product could take whole.

governance  the rulebook. Authoring checks, the dictionary, the article library.
lccheck     the examination. UCP 600, discrepancies, officers.

app         wiring. @SpringBootApplication, exception handling, nothing else.
```

Dependencies run downward only, and `lccheck → governance` is the one sideways edge — declared,
narrow, and tested. Governance never names lc-check, not even in a javadoc `{@link}`.

## 2. The litmus test

One question decides where a class lives:

> **Does it *do* something — orchestrate, cause a side effect, move state — or does it only *report*
> something?**

| | Category | Home |
|---|---|---|
| Does something, even as a bare interface | **behaviour** | the feature package, beside its implementation |
| Only reports state | **type** | `types/` |
| Reports state, but is a wire format | **DTO** | `api/dto/` — never inward |
| Reports state, but is a database row | **row** | `persistence/` — never outward |
| Signals a failure and knows its own status | **exception** | `infra/error/` |

`StageId` is an enum with `nextOfficerStage()` and it is a **type**: answering "what comes after me"
is self-description, not orchestration. `Stage` is an interface with one method and it is
**behaviour**. The test is about what the class does, not what shape it is.

## 3. Layout

```
lccheck/
├── api/            CaseController — routes and status codes, nothing else
│   └── dto/        request bodies. The API's shape, not the examination's.
├── service/        CaseService, CaseAssembler — the only place rows become types
├── pipeline/       Stage, StageContext (contracts) + PipelineService, DbStageContext (impl)
├── stage/          one package per stage: intake, interpret, gate, plan, execute, signoff
├── persistence/    CaseStore, Rows — SQL and column names live here and stop here
└── types/          pure data, mirroring the behaviour side by name
    ├── document/     FactView, LcDocument
    ├── examination/  PlanCheckView, FindingView, CheckArea, Areas, Origin
    └── pipeline/     StageOutcome

governance/
├── api/            five controllers, split by what they author
├── persistence/    GovernanceStore, GovernanceCatalog
├── seed/           the catalogue an empty deployment starts with
├── spi/            CheckCatalog — what governance offers other modules (see §4)
└── types/          Severity, Tier, CheckType, CitedAs, DocType — the shared kernel

harness/            doc/ · llm/ (+ text, vision, tool, chatcompletions)
infra/              blob/ · cache/ · config/ · error/ · stream/
```

Interfaces sit **beside** their implementations. There is no `impl/` package and there will not be
one: `Fluff` and `FluffImpl` in mirrored trees tells a reader nothing and costs them a jump. What
protects the design instead is the library rule — domain code that imports `RestClient` or
`JdbcTemplate` fails the build — which holds whatever the folders look like.

## 4. Crossing a module boundary

lc-check needs the rulebook. Two patterns could express that, and which one is right depends on a
single question: **may the supplier know who its consumers are?**

| | Contract owned by | Adapter lives in | Use when |
|---|---|---|---|
| **Open Host Service** | supplier (`governance/spi/`) | supplier | the supplier must stay ignorant of consumers |
| **Anti-Corruption Layer** | consumer (`<module>/port/`) | **consumer** | the consumer must not be shaped by the supplier's model |

We use **Open Host Service**. Governance publishes `spi/CheckCatalog`, shaped for what an examination
needs, and implements it itself. The alternative — lc-check owning the interface and governance
writing an adapter for it — would make governance depend on lc-check, which is the one direction this
codebase forbids.

`spi` here means what it means in Java: the interface a **provider** publishes and implements
(`java.sql.Driver`, `ServiceLoader`). If a module ever needs a contract *from* elsewhere, that goes in
a `port/` package. The two names are not interchangeable and the import tells you which direction you
are looking.

lc-check may import exactly two governance packages — `types` and `spi` — enforced as a **whitelist**.
A blacklist has to be edited every time governance grows a package, and the edit that gets forgotten
is the one that opens the boundary.

`governance/types` is a **shared kernel**: data only, no services, no state, and a change there is a
change to two modules at once. It stays small or it stops being a kernel.

## 5. Naming

| Kind | Pattern | Example |
|---|---|---|
| Business data | noun, no suffix | `CaseDetail`, `CreditTerms` |
| Projection for one screen or query | `…View` | `PlanCheckView`, `FindingView` |
| Wire format | `…Request` / `…Response` | `SignoffRequest` — `api/dto` only |
| Behaviour contract | plain noun, no `I`, no `Interface` | `Stage`, `BlobStore` |
| Implementation | named for its technology or its verb | `DbStageContext`, `ChatCompletionsGateway` |
| Published cross-module contract | plain noun in `spi/` | `CheckCatalog` |
| Exception | `…Exception` | `NotFoundException` |

## 6. The rules, and the test that enforces each

| Rule | Test |
|---|---|
| Layers depend only downward | `layersDependOnlyDownward` |
| Domain code never names an infrastructure library | `domainMustNotTouchInfrastructureLibraries` |
| Domain code depends on ports, never on `@Component` beans | `domainTalksToPortsNotBeans` |
| Harness never learns what a bill of lading is | `harnessStaysDomainNeutral` |
| lc-check sees only `governance.{types,spi}`; governance never sees lc-check | `lcCheckSeesOnlyTheGovernanceModel` |
| Governance source never contains the string `lccheck` — imports included | `noUpwardReferencesInSource` |
| Types depend on nothing that acts | `typesStayLeaves` |
| Types carry no Spring, JPA or Jackson annotations | `typesAreFrameworkFree` |
| Only service, stage and pipeline may name `persistence` | `persistenceIsReachedThroughItsStore` |
| Rows never reach the API or a type | `rowsDoNotEscapeThePersistencePackage` |
| DTOs never reach stages, pipeline, persistence or types | `dtosDoNotLeakInward` |
| Controllers never reach past their service | `controllersDoNotReachPastTheirService` |
| Controllers live in their module's `api` package | `controllersLiveInApiPackages` |
| Every package named by a rule actually exists | `declaredPackagesExist` |

Two of these are subtler than they look:

**`noUpwardReferencesInSource` reads source text, not bytecode.** ArchUnit sees compiled classes,
where an unused import has already been discarded — so a governance file can carry
`import …lccheck…` for a javadoc link and every other rule still passes. It is wrong anyway: it tells
the next reader that governance knows about examinations.

**`declaredPackagesExist` is the counterweight to `allowEmptyShould`.** A rule naming a misspelt
package matches nothing and passes. It reads green. Every package named in a boundary rule is listed
there, so a typo fails loudly instead of silently disarming a check.

## 7. Where this departs from the generic guideline

Three places, each because following it literally would have made this codebase worse.

**1. §5's port/adapter direction contradicts §4.** §4 fixes dependency direction — feature modules
depend on platform modules, never the reverse. §5 then puts the contract in the consumer and the
adapter in the supplier, which makes the supplier depend on the consumer. Both cannot hold. Resolved
in [§4](#4-crossing-a-module-boundary) above by naming both patterns and the question that picks one.

**2. `spi` was used backwards.** The guideline uses `spi/` for contracts a module needs *from* others.
In Java, SPI is what a *provider* implements. Keeping the inverted sense would mean every reader who
knows the platform meaning reads the dependency arrow the wrong way round. Here: `spi/` = published by
this module, `port/` = required by this module.

**3. `types/` is not applied to `harness` or `infra`.** Those are organised per *capability* —
`llm/vision` holds `VisionRequest`, `VisionResult` and the code that uses them, and splitting the data
into a `harness/types/vision` would separate a request record from the only interface that takes one,
for no gain. The guideline's §6 exception covers this ("fully self-contained, a realistic candidate for
extraction") and both qualify; this records the decision so it does not get re-litigated. `types/` is a
**feature-module** pattern, not a universal one.

## 7a. Reads are typed; writes are not, yet

`CaseStore`'s reads return records — `CaseRow` and the shapes in `ReadRows` — and every
snake_case column name in lc-check appears in one row-mapper block and nowhere else. Before that
the store returned `Map<String, Object>` and **85 column names** were spelled out across stages,
the pipeline and the assembler, so a rename compiled cleanly and failed at runtime in a file
nowhere near the migration that caused it. Fifteen `.get("…")` calls remain and none of them is a
column: they read parsed model JSON, which genuinely has no compile-time shape.

Typing the reads is also what made `rowsDoNotEscapeThePersistencePackage` writable. A map has no
type for ArchUnit to check; a record does.

**Writes still take `Map<String, Object>`** — `store.upsertFinding(caseId, Rows.of("severity", …))`.
Deliberate for now: those keys are the store's own vocabulary rather than column names, `Rows.of`
keeps them local to the call, and the same shape is what the governance controllers hand straight
from an HTTP body. It is the obvious next step, not a finished job.

**On ORMs, since it comes up.** JPA was considered and rejected on this schema: 23 `ON CONFLICT`
upserts it cannot express, `jsonb`/`TEXT[]`/`<@` it needs custom types or native queries for, seven
views it would map read-only against its own identity model — and it would put the query further
out of reach, not closer, since you would be reading generated SQL out of a log. The pattern here is
the opposite: complex reads move **into views**, which are versioned by Flyway and open in any DB
tool, and Java gets a typed row back.

## 8. Adding something new

- **A new stage** → a class in `stage/<name>/` implementing `Stage`, plus a `StageId` constant.
  Nothing else. `PipelineService` discovers it; ordering, events, retry and persistence are the
  orchestrator's, which is what makes a stage one file rather than five edits.
- **A new type** → `types/`, or `types/<subdomain>/` if it belongs to one. No annotations.
- **A new endpoint** → a method on a controller, one or two lines, delegating to a service.
- **A new provider** (model, cache tier, blob store) → an adapter in `infra` or `harness` behind the
  existing port. If this makes you edit a stage, the port is wrong.
- **A new cross-module need** → extend `governance/spi`, or add a second interface beside it. Do not
  reach into another module's persistence, and never query another module's tables.
