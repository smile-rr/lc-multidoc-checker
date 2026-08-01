# Java Package & Architecture Guideline
### For `tb-helix-ai-svc` — reference for refactoring and for guiding coding agents

> **Applied 2026-07-31.** The concrete result — what each package holds, which ArchUnit test
> enforces which rule, and how to add a stage — is
> [`docs/architecture/package-layout.md`](docs/architecture/package-layout.md). **That document is the
> authority for this codebase**; this one is the generic reasoning behind it.
>
> Four things were corrected while applying it. They are marked **[corrected]** below: the
> port/adapter direction in §5 contradicted §4, `spi` was used opposite to its Java meaning, §6's
> exception needed to be stated as a rule rather than a footnote, and §3's contract/impl pairing
> produced an interface with a single implementation that hid nothing.

---

## 1. Core Principles

1. **Top level = subdomains (vertical slices), not technical layers.**
   Package by business capability first (`governance`, `harness`, `infra`, `lccheck`, …). Never introduce a top-level package named after a technical role (`controllers`, `services`, `models`).

2. **Behavior stays together; interface and implementation live in the same package.**
   Do not separate `interfaces/` from `impl/`. A contract (`Stage`) and its implementation (`IntakeStage`) belong in the same feature package, so a reader sees "what it does" in one place, not scattered across mirrored folders.

3. **Data types are grouped separately from behavior, but mirror the subdomain structure.**
   All pure data (no framework, no orchestration logic) is collected under a `types/` root per module, with sub-packages named identically to the logic-side subdomains, so navigation is symmetric in both directions.

4. **Module dependencies flow one way and cross through explicit contracts only.** **[corrected]**
   Feature modules (e.g. `lccheck`) may depend on platform modules (`harness`, `infra`, `governance`), never the reverse. Cross-module access goes through an explicit interface — never a direct import of another module's internals, and never a query against another module's tables.

   *Which* interface depends on one question, and the original wording of §5 got it wrong by assuming there is only one answer. See §5.

5. **Rules are enforced by tests, not by convention alone.**
   Every rule below must have a corresponding `ArchUnit` rule in `ArchitectureTest.java`. If it can't be tested, it will eventually be violated.

---

## 2. The Litmus Test — deciding where a class belongs

Ask one question about the class:

> **Does it *do* something (orchestration, side effects, state transition) — or does it only *report* something (fields, equality, simple self-validation)?**

| Answer | Category | Location |
|---|---|---|
| Does something (even as a bare interface/contract) | **Logic** | Feature/subdomain package, next to its implementation |
| Only reports state, no framework annotations | **Type** | `types/<subdomain>/` |
| Reports state, but is a persistence mapping (JPA/row) | **Persistence model** | `persistence/`, never imported outside the Store |
| Reports state, but is a wire-format for a request/response | **DTO** | `api/dto/` |
| Signals an error condition, carries behavior for handling it | **Exception** | `error/` (its own category, not `types`) |
| Defines what one module needs from another | **Port/SPI** | `spi/` in the consumer module |
| Fulfils a port for another module | **Adapter** | `adapter/` in the supplier module |

This test is the single source of truth used to resolve every "is this a domain object or a service?" ambiguity — apply it per class, not per package.

---

## 3. Package Layout Template (per feature module)

```
<module>/
├── api/
│   ├── XxxController.java
│   └── dto/                     # wire-format only, never reused internally
│       └── XxxRequest.java / XxxResponse.java
├── service/                     # orchestration / use-case layer
│   ├── XxxService.java
│   └── XxxAssembler.java        # the ONLY place allowed to convert types <-> dto
├── <core-engine-package>/       # e.g. pipeline/ — contracts + their default impl together
│   ├── Stage.java                (interface — several implementations)
│   ├── StageContext.java         (final class — see the note below)
│   └── PipelineEngine.java
├── <subdomain-a>/ <subdomain-b>/ ...   # e.g. stage/intake, stage/plan, stage/execute
│   └── XxxStage.java, XxxReader.java   # behavior, interface + impl co-located
├── persistence/
│   ├── XxxStore.java             # interface + impl (or split Store / JdbcStore)
│   └── Rows.java                 # entity/row mapping only
├── spi/                          # ports THIS module needs from other modules
│   └── XxxCatalogPort.java
└── types/                        # pure data, mirrors subdomain names above
    ├── CaseDetail.java, RunState.java, StageId.java
    ├── <subdomain-a>/  XxxOutcome.java
    └── <subdomain-b>/  XxxView.java
```

For a module that *supplies* a port to another module, add:
```
<module>/
└── adapter/
    └── XxxPortAdapter.java       # implements the consumer's spi.XxxPort, translates its own types
```


### Pair a contract with an implementation only when something varies **[corrected]**

The sketch above once read `StageContext.java (interface)` + `DbStageContext.java (impl)`, and that
is what was built. It was justified as narrowing what a stage may reach — the interface exposes
`recordStep`, the record also holds the store and the event bus. Then every stage turned out to be
constructed with the store anyway, so the narrowing was fictional: two files, one implementation, no
seam anyone could stand in.

A contract earns its own file when a **second** implementation exists, is imminent, or is the point
(`BlobStore`: disk today, S3 tomorrow). Otherwise a final class with private fields says the same
thing — its public methods are the surface — in one file. `Stage` stays an interface because six
classes implement it.

Splitting is cheap later and mechanical; guessing wrong costs a file and a jump on every read.

---

## 4. Naming Conventions

| Kind | Suffix / Pattern | Notes |
|---|---|---|
| Pure business data | no suffix, noun | `CaseDetail`, `CreditTerms` |
| Read-only projection for a query/UI scenario | `...View` | `PlanCheckView`, `FindingView` |
| Cross-boundary transport object | `...Request` / `...Response` | lives only in `api/dto` |
| Persistence mapping | `...Row` / `...Entity` | lives only in `persistence`, never imported by `service`/`stage` directly |
| Behavior contract | plain domain verb/noun, no `I` prefix, no `Interface` suffix | `Stage`, `ChatCompletionsClient` |
| Behavior implementation | prefixed by technology or verb | `PgDerivationCache`, `ChatCompletionsBackend` |
| Cross-module contract owned by the consumer | `...Port` | `CheckCatalogPort` |
| Cross-module contract fulfilled by the supplier | `...Adapter` | `LccheckCatalogAdapter` |
| Exception | `...Exception` | own `error/` package, not `types` |

---

## 5. Cross-Module Decoupling — two patterns, one question **[corrected]**

The original text prescribed a single shape: contract owned by the consumer, adapter written by the
supplier. That contradicts §4 — an adapter in `B` implementing an interface owned by `A` means `B`
depends on `A`, which is the direction §4 forbids. Both rules cannot hold at once.

The question that resolves it: **may the supplier know who its consumers are?**

| | Contract owned by | Adapter lives in | Use when |
|---|---|---|---|
| **Open Host Service** | supplier, in `B/spi/` | supplier | `B` must stay ignorant of its consumers, or has several |
| **Anti-Corruption Layer** | consumer, in `A/port/` | **consumer** | `A` must not be shaped by `B`'s model, e.g. a legacy or third-party upstream |

Note that in **both** rows the module that owns the interface also depends only downward. The
combination the original text described — consumer-owned interface, supplier-written adapter — is
DDD's *Customer/Supplier*, and it requires the upstream to accept a downstream dependency. Use it only
where that is genuinely acceptable; it is not, in a codebase whose whole point is that governance can
be extracted.

Rules that hold whichever pattern applies:

1. The interface speaks the **caller's** problem, not the supplier's schema. `CheckCard` is flattened
   to what an examination needs, not to how a check is stored.
2. The consumer's logic depends only on the interface. It never imports the supplier's persistence or
   internal packages.
3. **Database access never crosses module boundaries.** `A` must not query `B`'s tables. Ever. This is
   the rule that makes extraction a deployment change rather than a rewrite.
4. Enforce the allowed cross-module packages as a **whitelist**, not a blacklist. A blacklist must be
   edited every time the supplier grows a package, and the forgotten edit is the one that opens the
   boundary.
5. Value types with zero behaviour that are genuinely universal (e.g. `Severity`, `Tier`) may be
   promoted to a shared package — a true DDD **Shared Kernel**: data-only, low change frequency, and a
   change there is a change to two modules at once. No business rules, no logic. It stays small or it
   stops being a kernel and becomes a junk drawer.

### `spi` vs `port` **[corrected]**

The original text used `spi/` for contracts a module needs *from* others. That is backwards from the
platform's own meaning: in Java, an SPI is what a **provider** implements — `java.sql.Driver`,
`ServiceLoader`. Keeping the inverted sense means every reader who knows the standard meaning reads
the dependency arrow the wrong way round.

> **`spi/`** — published *by* this module, for others to call.
> **`port/`** — required *by* this module, implemented elsewhere.

The import then tells you the direction without opening the file.

---

## 6. `types/` Placement — a feature-module pattern **[corrected]**

**`types/` is for feature modules, not for every module.** Stated as a footnote-level "exception" this
gets ignored, so it is a rule now.

**Default, in a feature module** (`lccheck`, `governance`): one `types/` root, sub-packaged to mirror
the behaviour-side subdomain names. Use this when types are shared across more than one subdomain,
which is the common case. It avoids "which subdomain owns this type" disputes and gives one place to
scan every data shape in the module.

**Do not apply it to a platform module** (`harness`, `infra`). Those are organised per *capability*,
where a contract, its implementation and its data are one idea: `harness/llm/vision` holds
`VisionRequest`, `VisionResult` and the gateway method that takes one. Hoisting the records into
`harness/types/vision` would separate a request from the only interface that accepts it, and buy
nothing — nobody scans a platform module for "all its data shapes"; they read it capability by
capability. These modules are also the most likely to be extracted whole, and a `types/` root would be
one more thing to unpick.

The distinction that actually matters:

> **Do people read this module flow-first or shape-first?** A feature module is read flow-first —
> follow the use case, look up shapes as needed — so hoisting types out helps. A platform module is
> read capability-first, and hoisting hurts.

Whichever applies, record the choice in the module's `package-info.java`, so the next person changes it
on purpose rather than by habit.

---

## 7. ArchUnit Rules to Add

- `types` packages must not depend on `service`, `stage`, `pipeline`, or `persistence` packages (types stay leaf nodes).
- Classes in `types` packages must carry no Spring or JPA annotations — **and no serialiser annotations either**, or the wire format ends up dictated from inside the model.
- `persistence` Row/Entity classes must not be imported outside their own `Store` implementation. *This is only enforceable once reads are typed — a store returning `Map<String, Object>` gives ArchUnit no type to check, and the column names leak invisibly. Type the reads first; the rule follows. Until then, enforce the weaker form: nothing outside `service`/`stage`/`pipeline` may name the persistence package at all.*
- DTOs must not leak inward — nothing in `stage`, `pipeline`, `persistence` or `types` may name `api/dto`.
- A feature module must not import another module's internals. State this as a **whitelist** of permitted packages (`types`, `spi`), never a blacklist of forbidden ones.
- Dependency direction between modules is fixed and tested (e.g. `lccheck → harness/infra/governance`, never the reverse).
- **Every package named in a rule above must be asserted to exist.** This is not optional bookkeeping. A rule naming a misspelt package matches nothing, passes, and reads green — a disarmed check is worse than an absent one, because it looks like coverage.
- **Check the rules against a deliberate violation before trusting them.** Introduce one, watch the build go red, revert. A boundary test that has never failed has not been tested.
- Where a rule concerns something the compiler discards — an unused import kept for a javadoc `{@link}` — ArchUnit cannot see it, because it reads bytecode. Read the source text for those.

---

## 8. Refactor Checklist (apply module by module, not all at once)

1. Rename the module's `domain` package to `types`.
2. Run the litmus test (§2) on every class currently in `domain`; move behavior-bearing classes (even bare interfaces) out to the appropriate logic package.
3. Create `types/<subdomain>/` sub-packages mirroring the logic-side subdomain names.
4. Separate `api/dto` from `types` — introduce/verify an `Assembler` class as the only place that converts between them.
5. For any direct cross-module dependency on another module's internal tables/config, introduce the `spi`/`adapter` pattern from §5.
6. Add the ArchUnit rules from §7; run and fix violations before moving to the next module.
7. Repeat per module: `governance` → `harness` → `infra` → `lccheck`.

---

## 9. Rationale (for future reference)

This structure is a deliberate hybrid of two well-established patterns, chosen for a mid-size modular monolith read primarily "flow-first":

- **Screaming Architecture / Vertical Slice Architecture** — top-level packaging communicates business capability, not technology; a new reader should understand what the system does from the folder tree alone, and related behavior for a use case stays together rather than being scattered across mirrored technical layers.
- **DDD Context Mapping (Customer–Supplier, Shared Kernel, Anti-Corruption Layer)** — cross-module data dependencies are modeled explicitly as upstream/downstream relationships with a translation seam, instead of implicit direct imports of another module's internals. This is also what makes future extraction into standalone services low-risk: the port/adapter seam is already the extraction boundary.

The one deliberate deviation from "pure" vertical slice purism is keeping a **module-level `types/` root** rather than nesting all types inside each subdomain folder — this was chosen because in this codebase, type definitions change frequently, are read *after* understanding the flow (not before), and are often shared across more than one subdomain within a module. A module-level, subdomain-mirrored `types/` root gives fast scanning without breaking the "read behavior first" workflow.
