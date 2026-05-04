# LC Checker v2 — CLAUDE.md
# Multi-Document Compliance Engine with Agentic Rule Execution

> **For Claude Code**: This is the authoritative implementation plan for lc-check-svc v2.
> Read this file in full before touching any source file.
> v1/ is READ-ONLY reference. Never modify v1 code.

---

## 0. Repository Layout

```
lc-checker-workspace/
├── CLAUDE.md                        ← this file (root, always loaded)
├── v1/                              ← READ-ONLY. Frozen reference.
│   └── lc-check-svc/               ← v1 Spring Boot, single-doc, 35 rules
├── v2/                              ← ACTIVE DEVELOPMENT
│   ├── CLAUDE.md                    ← v2-specific overrides (load when in v2/)
│   ├── lc-check-svc/               ← main Java/Spring Boot service
│   └── ui/                         ← frontend (out of scope this phase)
├── design/                         ← static HTML prototypes (read-only reference)
└── docs/
    ├── ucp600-articles.md
    ├── isbp821-paragraphs.md
    └── domain-glossary.md
```

---

## 1. Project Context

### What this system does
Accept a SWIFT MT700 (Letter of Credit) + a set of trade finance documents (Invoice, B/L, Packing List, etc.), run compliance checks against UCP 600 / ISBP 821 rules, return structured discrepancy findings.

### Key differences from v1
| Concern | v1 | v2 |
|---|---|---|
| Document scope | Invoice only | Multi-doc: INV, BOL, PKL, BOE, BC, WC, INS |
| Rule count | 35 | 10 consolidated (covers ~70% real discrepancies) |
| Rule execution | 3-tier (PROG/AGENT/AGENT_TOOL) | 4-tier + AGENTIC with tool calling |
| 47A handling | Single LLM call | Dynamic decompose → per-condition agents |
| Session state | Stateless | CheckSession with DocInventory pre-step |
| LLM framework | Spring AI basic | Spring AI tool calling + StringTemplate prompts |

### Tech Stack (locked — do not change without explicit instruction)
- **Runtime**: Java 21, Spring Boot 3.3.x
- **AI Framework**: Spring AI 1.0.x (OpenAI-compatible client)
- **LLM Primary**: DeepSeek (openai-compatible endpoint)
- **LLM Fallback**: MiniMax (openai-compatible endpoint)
- **MT700 Parsing**: Prowide Core (open edition) + custom regex sub-field parsers
- **PDF Extraction**: Docling-svc (Python FastAPI, port 8001), MiniRU-svc (port 8002)
- **Rule Config**: catalog.yml (YAML, loaded at startup, hot-reload NOT required)
- **Prompt Templates**: StringTemplate4 (.st files under resources/prompts/)
- **SpEL**: For PROGRAMMATIC rule expressions
- **Monetary**: BigDecimal only — never float/double
- **Persistence (V2)**: PostgreSQL + Redis (V1 is in-memory session only)
- **Build**: Maven, Java 21 toolchain

---

## 2. Active Rule Catalog (catalog.yml — current version)

Rules live at `src/main/resources/catalog.yml`. The file is the source of truth.
**Do not hardcode rule logic — everything must be catalog-driven.**

### Rule Summary Table
```
OP01  CURRENCY-CONSISTENT         PROGRAMMATIC   INV/BOE/INS    CRITICAL
OP02  AMOUNT-WITHIN-LC            AGENT_TOOL     INV/BOE        CRITICAL
OP03  DOC-DATE-VALID              PROGRAMMATIC   ALL            MAJOR
OP04  PRESENTATION-WINDOW         AGENT_TOOL     BOL            CRITICAL
OP05  BENEFICIARY-CONSISTENT      AGENT          INV/BOE/BC/WC  CRITICAL
OP06  GOODS-DESCRIPTION           AGENTIC        INV/BOL/PKL    MAJOR
OP07  BL-ONBOARD-VALID            AGENT          BOL            CRITICAL
OP08  BL-CLEAN                    AGENT          BOL            MAJOR
OP09  46A-DOC-SET-COMPLETE        AGENTIC        session-wide   CRITICAL
OP10  BC-WC-47A-CONDITIONS        AGENTIC        BC/WC          MAJOR
```

### check_type Semantics
- `PROGRAMMATIC` — SpEL expression only, zero LLM
- `AGENT` — single LLM call, structured prompt, ucp_excerpt injected
- `AGENT_TOOL` — LLM with deterministic calc tools (date diff, tolerance math)
- `AGENTIC` — thinking loop + tool calling; see Section 5

---

## 3. Data Models

### 3.1 Input Models

```java
// POST /api/v2/check
public record CheckRequest(
    String sessionId,          // client-generated UUID
    String mt700Raw,           // full SWIFT MT700 plain text
    String presentationDate,   // ISO date yyyy-MM-dd
    List<DocumentUpload> documents
) {}

public record DocumentUpload(
    DocType docType,           // INV, BOL, PKL, BOE, BC, WC, INS
    String filename,
    byte[] content             // raw PDF bytes
) {}

public enum DocType { INV, BOL, PKL, BOE, BC, WC, INS }
```

### 3.2 Session Models

```java
public record CheckSession(
    String sessionId,
    String presentationDate,
    LCDocument lc,                           // parsed MT700
    Map<DocType, ExtractedDoc> docs,         // extracted per-doc fields
    DocInventory inventory,                  // pre-step output
    List<RuleResult> results,                // per-rule findings
    SessionStatus status                     // PENDING/RUNNING/COMPLETE/ERROR
) {}

public record DocInventory(
    List<DocInventoryItem> items,
    List<DocType> presentedTypes,
    List<String> missingVsRequired,          // diff against 46A requirements
    boolean inventoryReady
) {}

public record DocInventoryItem(
    DocType docType,
    int pageCount,
    double extractionConfidence,             // 0.0 – 1.0
    List<String> extractedFields,
    List<String> missingFields,
    List<String> warnings
) {}
```

### 3.3 Rule Result Models

```java
public record RuleResult(
    String ruleId,
    Verdict verdict,                         // PASS / FAIL / NOT_APPLICABLE / NEEDS_REVIEW
    String explanation,
    double confidence,                       // 0.0 – 1.0
    String uncertaintyReason,               // non-null when confidence < 0.8
    List<String> discrepancies,
    boolean waivable,
    Severity severity,
    List<ConditionResult> conditionResults   // non-empty for AGENTIC OP10 only
) {}

public record ConditionResult(
    String conditionId,                      // "47A-C1", "47A-C2" …
    String conditionText,
    ConditionType conditionType,             // CERTIFICATION/CROSS_REF/TIMING/INSPECTION_BODY/PACKING_DETAIL/ENDORSEMENT/UNKNOWN
    Verdict verdict,
    double confidence,
    String explanation
) {}

public enum Verdict { PASS, FAIL, NOT_APPLICABLE, NEEDS_REVIEW }
public enum Severity { CRITICAL, MAJOR, MINOR }
public enum ConditionType {
    CERTIFICATION, CROSS_REF, TIMING, INSPECTION_BODY,
    PACKING_DETAIL, ENDORSEMENT, UNKNOWN
}
```

### 3.4 LCDocument (parsed MT700 fields used by rules)

```java
public record LCDocument(
    // Identity
    String creditNumber,           // :20:
    String creditType,             // :40A:
    // Parties
    String applicantName,          // :50:
    String beneficiaryName,        // :59:
    // Amount & Currency
    String creditCurrency,         // :32B: currency part
    BigDecimal creditAmount,       // :32B: amount part
    boolean aboutCreditAmount,     // true if :32B: or :39A: has ABOUT/APPROX
    BigDecimal tolerancePlus,      // :39A: + side, null if not stated
    BigDecimal toleranceMinus,     // :39A: - side, null if not stated
    // Dates
    String expiryDate,             // :31D: date
    String expiryPlace,            // :31D: place
    String latestShipmentDate,     // :44C:
    Integer presentationDays,      // :48:, default 21 per UCP 14(c)
    // Shipment
    String portOfLoading,          // :44E:
    String portOfDischarge,        // :44F:
    String transhipment,           // :43T: ALLOWED/NOT ALLOWED
    String partialShipment,        // :43P: ALLOWED/NOT ALLOWED
    // Goods
    String goodsDescription,       // :45A:
    // Documents
    String documentsRequired,      // :46A: raw text
    String additionalConditions    // :47A: raw text
) {}
```

---

## 4. Pipeline Architecture

```
POST /api/v2/check
        │
        ▼
┌─────────────────────────────────────┐
│  Step 0: DocInventoryStep           │  ← synchronous, before any rule
│  • call docling-svc / mineru-svc    │
│  • build DocInventory               │
│  • cache to session store           │
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│  Phase 1 (parallel):                │
│  PROGRAMMATIC rules                 │  ← SpEL, no LLM
│  OP01, OP03                         │
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│  Phase 2 (parallel):                │
│  AGENT + AGENT_TOOL rules           │  ← single LLM calls
│  OP02, OP04, OP05, OP07, OP08       │
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│  Phase 3 (parallel):                │
│  AGENTIC rules                      │  ← tool-calling loop
│  OP06 (45A), OP09 (46A),            │
│  OP10 (47A decompose→per-condition) │
└─────────────────────────────────────┘
        │
        ▼
   CheckSession (complete)
   GET /api/v2/check/{sessionId}/trace
```

---

## 5. Agentic Architecture

### 5.1 Core Design Principle
No RAG. No vector DB. `ucp_excerpt` from catalog.yml is injected directly into the prompt — "poor man's RAG" that's sufficient for POC.

### 5.2 Tool Registry (5 tools, shared across all agentic agents)

```java
@Component
public class AgenticToolRegistry {

    @Tool(description = "Get the doc inventory for this session including extraction confidence and missing fields")
    public DocInventory getDocInventory(String sessionId) { ... }

    @Tool(description = "Get a specific field value from the parsed LC (MT700)")
    public String getLcField(String sessionId, String fieldKey) { ... }

    @Tool(description = "Get a specific field value from an extracted document")
    public String getDocField(String sessionId, String docType, String fieldKey) { ... }

    @Tool(description = "Calculate difference in calendar days between two ISO dates (yyyy-MM-dd)")
    public int calculateDateDiff(String dateFrom, String dateTo) { ... }

    @Tool(description = "List all document types that were presented in this session")
    public List<String> listPresentedDocs(String sessionId) { ... }
}
```

### 5.3 Static Agentic Agents

**GoodsDescAgent (OP06 — 45A)**
- Anchor: `lc.goodsDescription` (field :45A:)
- Checks: invoice strict correspondence; BOL/PKL non-contradiction
- Key rule injected: UCP 18(c) strict for INV, UCP 14(e) general for others
- Prompt: `prompts/agentic/op06-goods-desc.st`
- max_iterations: 4, thinking_enabled: true

**DocSetAgent (OP09 — 46A)**
- Anchor: `lc.documentsRequired` (field :46A:)
- Checks: all required doc types present; originals/copies counts satisfied
- Uses: `getDocInventory()` → `inventory.missingVsRequired` as starting point
- Prompt: `prompts/agentic/op09-doc-set.st`
- max_iterations: 5, thinking_enabled: true

### 5.4 Dynamic Agentic: 47A Decomposer (OP10)

**Two-phase execution:**

**Phase A — 47AParserAgent (single LLM call, not a loop)**
- Input: raw `:47A:` text
- Output: `List<ConditionCheck>` — structured JSON, one item per condition clause
- Each item: `{ id, text, conditionType, docsNeeded[], toolsNeeded[] }`
- Prompt: `prompts/agentic/op10-47a-parser.st`
- Validate output: confirm condition count matches clause count in raw text

**Phase B — ConditionAgents (one per condition, run in parallel)**
- Each agent receives: its single condition text + conditionType + ucp_excerpt relevant to that type
- Tools pre-selected per conditionType:
  ```
  CERTIFICATION     → getLcField, getDocField
  CROSS_REF         → getDocField (multi-doc)
  TIMING            → calculateDateDiff, getDocField
  INSPECTION_BODY   → getLcField, getDocField
  PACKING_DETAIL    → getDocField (PKL)
  ENDORSEMENT       → getDocField (BOL)
  UNKNOWN           → all 5 tools, thinking_enabled: true, max_iterations: 6
  ```
- Output per agent: `ConditionResult`
- Prompt: `prompts/agentic/op10-condition-check.st`

### 5.5 Agent Guard Pattern (apply in every agentic agent)

Before entering the reasoning loop, check:
```java
// Pre-flight guard
DocInventory inv = toolRegistry.getDocInventory(sessionId);
for (DocType required : rule.getAppliesTo()) {
    DocInventoryItem item = inv.getItem(required);
    if (item == null) return RuleResult.notApplicable(ruleId, required + " not presented");
    if (item.extractionConfidence() < 0.75)
        return RuleResult.needsReview(ruleId, required + " extraction confidence too low: " + item.extractionConfidence());
}
// proceed to LLM loop
```

---

## 6. Module Breakdown & File Structure

```
v2/lc-check-svc/src/main/
├── java/com/lc/v2/
│   ├── LcCheckApplication.java
│   │
│   ├── api/
│   │   ├── CheckController.java          ← POST /check, GET /check/{id}/trace
│   │   └── dto/                          ← CheckRequest, CheckResponse
│   │
│   ├── session/
│   │   ├── CheckSession.java
│   │   ├── CheckSessionStore.java        ← in-memory Map for V1; Redis for V2
│   │   └── SessionStatus.java
│   │
│   ├── parse/
│   │   ├── mt700/
│   │   │   ├── Mt700Parser.java          ← Prowide Core entry point
│   │   │   ├── SubFieldParser.java       ← regex sub-field parsers
│   │   │   ├── LCDocument.java
│   │   │   └── FieldPoolRegistry.java    ← catalog.yml field key → tag mapping
│   │   └── doc/
│   │       ├── DocExtractionClient.java  ← calls docling-svc / mineru-svc
│   │       ├── ExtractedDoc.java
│   │       └── DocType.java
│   │
│   ├── inventory/
│   │   ├── DocInventoryStep.java         ← pre-pipeline step
│   │   ├── DocInventory.java
│   │   └── DocInventoryItem.java
│   │
│   ├── catalog/
│   │   ├── RuleCatalog.java              ← loads catalog.yml at startup
│   │   ├── RuleDefinition.java           ← maps to one rule in YAML
│   │   ├── AgenticConfig.java            ← agentic_config sub-block
│   │   └── TriggerEvaluator.java         ← evaluates triggers DSL
│   │
│   ├── engine/
│   │   ├── ComplianceEngine.java         ← orchestrates all 4 phases
│   │   ├── phase/
│   │   │   ├── ProgrammaticPhase.java
│   │   │   ├── AgentPhase.java
│   │   │   ├── AgentToolPhase.java
│   │   │   └── AgenticPhase.java
│   │   └── spel/
│   │       ├── SpelRuleExecutor.java
│   │       └── MultiDocHelpers.java      ← static helpers for SpEL expressions
│   │
│   ├── checker/                          ← one class per check_type
│   │   ├── RuleChecker.java              ← interface: check(session, rule) → RuleResult
│   │   ├── ProgrammaticChecker.java
│   │   ├── AgentChecker.java
│   │   ├── AgentToolChecker.java
│   │   └── agentic/
│   │       ├── AgenticOrchestrator.java  ← dispatches to static/dynamic agents
│   │       ├── AgenticToolRegistry.java  ← 5 @Tool methods
│   │       ├── GoodsDescAgent.java       ← OP06, 45A anchor
│   │       ├── DocSetAgent.java          ← OP09, 46A anchor
│   │       └── op10/
│   │           ├── ConditionsAgent.java  ← OP10 entry point
│   │           ├── ParserAgent47A.java   ← Phase A: decompose 47A text
│   │           ├── ConditionCheck.java   ← per-condition check spec
│   │           └── ConditionAgent.java   ← Phase B: per-condition execution
│   │
│   ├── model/
│   │   ├── RuleResult.java
│   │   ├── ConditionResult.java
│   │   ├── Verdict.java
│   │   ├── Severity.java
│   │   └── ConditionType.java
│   │
│   └── config/
│       ├── SpringAiConfig.java           ← ChatClient beans, primary/fallback
│       ├── LlmProperties.java            ← deepseek/minimax endpoints
│       └── ObjectMapperConfig.java       ← Jackson SNAKE_CASE strategy
│
└── resources/
    ├── catalog.yml                       ← THE rule catalog (provided)
    ├── application.yml
    ├── application-local.yml
    └── prompts/
        ├── agent/
        │   ├── op02-amount.st
        │   ├── op04-presentation-window.st
        │   ├── op05-beneficiary.st
        │   ├── op07-bl-onboard.st
        │   └── op08-bl-clean.st
        └── agentic/
            ├── op06-goods-desc.st
            ├── op09-doc-set.st
            ├── op10-47a-parser.st
            └── op10-condition-check.st
```

---

## 7. Key Implementation Details

### 7.1 Spring AI Tool Calling Pattern

```java
// AgenticToolRegistry — register tools as Spring beans
@Component
public class AgenticToolRegistry {
    private final CheckSessionStore sessionStore;

    @Tool(description = "...")
    public DocInventory getDocInventory(String sessionId) {
        return sessionStore.get(sessionId).inventory();
    }
    // ... other tools
}

// Agent execution
ChatClient chatClient = ChatClient.builder(chatModel)
    .defaultTools(agenticToolRegistry)   // inject all 5 tools
    .build();

String response = chatClient.prompt()
    .system(systemPrompt)
    .user(userPrompt)
    .call()
    .content();
```

### 7.2 StringTemplate Prompt Pattern

```
// prompts/agentic/op06-goods-desc.st
You are an expert LC examiner applying UCP 600 and ISBP 821.

## Rule
<ucp_excerpt>
$ucpExcerpt$
</ucp_excerpt>

## LC Goods Description (Field 45A)
$goodsDescription$

## Your Task
1. Use get_doc_field to retrieve invoice goods description
2. Use get_doc_field for BOL and PKL descriptions if presented
3. Apply UCP 18(c) STRICT standard to INV: must correspond
4. Apply UCP 14(e) GENERAL standard to BOL/PKL: must not conflict
5. State your verdict: PASS / FAIL / NEEDS_REVIEW
6. Confidence 0.0-1.0 and reason if < 0.8

Session ID: $sessionId$

Respond in JSON:
{ "verdict": "PASS|FAIL|NEEDS_REVIEW", "confidence": 0.0-1.0,
  "explanation": "...", "discrepancies": [], "uncertaintyReason": "..." }
```

### 7.3 Programmatic SpEL Helpers (MultiDocHelpers)

```java
public class MultiDocHelpers {
    // OP01
    public static boolean currencyConsistent(
        Map<DocType, ExtractedDoc> docs, String lcCurrency) { ... }

    // OP03
    public static boolean docDatesValid(
        Map<DocType, ExtractedDoc> docs, LocalDate presentationDate) { ... }
}
```

### 7.4 Tolerance Logic for OP02 (AGENT_TOOL)

```
Priority order (inject into prompt as tool context):
1. :39A: explicit % → use those exact values
2. ABOUT / APPROXIMATELY in :32B: → ±10% on amount AND quantity
3. Bulk goods, no unit count in :45A: → quantity ±5%, amount must NOT exceed LC
4. Default → exact match, no overdraw permitted
```

### 7.5 47A Decomposer Output Contract

```json
// ParserAgent47A expected output (validate before spawning ConditionAgents)
{
  "conditions": [
    {
      "id": "47A-C1",
      "text": "BENEFICIARY'S CERTIFICATE CERTIFYING GOODS ARE NEW AND UNUSED",
      "conditionType": "CERTIFICATION",
      "docsNeeded": ["BC"],
      "toolsNeeded": ["getDocField", "getLcField"]
    },
    {
      "id": "47A-C2",
      "text": "ALL DOCUMENTS MUST BE PRESENTED WITHIN 15 DAYS OF B/L DATE",
      "conditionType": "TIMING",
      "docsNeeded": ["BOL"],
      "toolsNeeded": ["calculateDateDiff", "getDocField"]
    }
  ],
  "rawConditionCount": 2,
  "parsedConditionCount": 2
}
```

**Validation rule**: if `parsedConditionCount != rawConditionCount` → log warning, return `NEEDS_REVIEW` for OP10.

---

## 8. API Contract

### POST /api/v2/check
```
Content-Type: multipart/form-data
Parts:
  - request: JSON (CheckRequest)
  - files: one PDF per document type, filename = docType (e.g. INV.pdf)

Response 200:
{
  "sessionId": "uuid",
  "status": "COMPLETE",
  "summary": {
    "totalChecks": 10,
    "passed": 7,
    "failed": 2,
    "notApplicable": 1,
    "needsReview": 0,
    "criticalFailures": 1
  },
  "results": [ /* List<RuleResult> */ ]
}
```

### GET /api/v2/check/{sessionId}/trace
```
Response 200: full CheckSession JSON including inventory + all intermediate results
```

---

## 9. Migration from v1 Design

### What carries over unchanged
- MT700 parsing (Prowide Core + SubFieldParser pattern)
- Spring AI ChatClient bean config (DeepSeek primary / MiniMax fallback)
- StringTemplate4 prompt pattern
- RuleChecker interface
- SpEL expression executor
- BigDecimal monetary handling

### What is NEW in v2
| Component | Action |
|---|---|
| DocInventoryStep | New — write from scratch |
| AgenticOrchestrator + 3 static agents | New |
| ParserAgent47A + ConditionAgent | New |
| AgenticToolRegistry (5 tools) | New |
| catalog.yml (v2, 10 rules) | Replace v1 catalog |
| ComplianceEngine phases 1-3 | Refactor from v1 3-phase |
| CheckSession (with inventory) | Extend v1 session model |
| OP06/OP09/OP10 prompts | New (agentic/ folder) |
| MultiDocHelpers | Extend v1 helpers for multi-doc |
| DocExtractionClient | Extend — multi-doc support |

### What is REMOVED / deprecated
- v1 single-doc assumption in session and extractor
- v1 35-rule catalog (archive, do not delete — ref only)
- Any hardcoded rule logic not driven by catalog

---

## 10. Implementation Order

Follow this sequence. Do not skip ahead — later steps depend on earlier ones.

```
STEP 01  Project skeleton — Maven pom, packages, application.yml
STEP 02  LCDocument model + Mt700Parser (Prowide Core + regex)
STEP 03  FieldPoolRegistry — catalog.yml field key → SWIFT tag mapping
STEP 04  DocType, ExtractedDoc, DocExtractionClient (docling-svc / mineru-svc)
STEP 05  DocInventory models + DocInventoryStep (call extractors, build inventory)
STEP 06  CheckSession + CheckSessionStore (in-memory for V1)
STEP 07  RuleCatalog loader — parse catalog.yml into List<RuleDefinition>
STEP 08  TriggerEvaluator — evaluate triggers DSL against session
STEP 09  MultiDocHelpers + SpelRuleExecutor
STEP 10  ProgrammaticChecker → OP01, OP03
STEP 11  AgentChecker + prompts/agent/*.st → OP05, OP07, OP08
STEP 12  AgentToolChecker → OP02 (tolerance), OP04 (date window)
STEP 13  AgenticToolRegistry (5 @Tool methods)
STEP 14  GoodsDescAgent + op06-goods-desc.st prompt
STEP 15  DocSetAgent + op09-doc-set.st prompt
STEP 16  ParserAgent47A + op10-47a-parser.st prompt
STEP 17  ConditionAgent + op10-condition-check.st prompt + ConditionsAgent orchestrator
STEP 18  AgenticOrchestrator (dispatches OP06/09/10)
STEP 19  AgenticPhase + ComplianceEngine (phases 1→2→3)
STEP 20  CheckController (POST /check, GET /trace)
STEP 21  Integration test — 4 document bundles, verify all 10 rules fire correctly
STEP 22  Error handling — extractor timeout, LLM failure, low-confidence guards
```

---

## 11. DO NOT Rules (for Claude Code)

- **DO NOT** use float or double for any monetary value
- **DO NOT** hardcode UCP/ISBP text in Java — it lives in catalog.yml `ucp_excerpt`
- **DO NOT** add RAG, vector DB, or ChromaDB — not in scope for this phase
- **DO NOT** add Redis or PostgreSQL — V1 uses in-memory session only
- **DO NOT** modify anything under v1/
- **DO NOT** create new rule files outside catalog.yml without explicit instruction
- **DO NOT** use Spring AI's deprecated `FunctionCallback` — use `@Tool` annotation
- **DO NOT** run multiple LLM calls sequentially when parallel execution is possible
- **DO NOT** proceed past STEP 07 without confirming catalog.yml loads correctly

---

## 12. Test Acceptance Criteria

Each of the 4 test document bundles must produce:
- OP01: PASS when all currencies match LC; FAIL with specific doc called out when not
- OP02: Correct tolerance regime applied (check :39A: first, then ABOUT wording)
- OP03: FAIL any doc dated after presentationDate
- OP04: FAIL when days(blDate → presentationDate) > min(presentationDays, daysToExpiry)
- OP05: PASS for acceptable abbreviations (Ltd/Limited); FAIL for meaning-changing differences
- OP06: PASS when INV description corresponds; FAIL with explanation when it conflicts
- OP07: FAIL when on-board notation missing or port mismatch
- OP08: FAIL when B/L has damage/defect clause
- OP09: FAIL listing each missing required document
- OP10: Per-condition results — each 47A clause individually PASS/FAIL/NEEDS_REVIEW
