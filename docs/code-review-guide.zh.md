# LC Checker v2 — 代码评审 & 上手指南（中文）

> 阅读对象：第一次接手 v2 的工程师 / 想做实现审计的评审者。
> 阅读路径：第 1 章建立全局心智模型 → 第 2 章顺着主流程跑一遍 → 第 3 章按模块深入 → 第 4 章按"关键技术"补齐 Spring AI / Prompt / 规则配置的细节 → 第 5 章带着"已知风险清单"做评审。

---

## 1. 全局心智模型（30 秒版）

```
                          [ React UI :5173/9080 ]
                                  │  REST + SSE
                                  ▼
                       [ Spring Boot :9082 ]
   ┌────────────┬────────────┬────────────┬────────────┬────────────┐
   │  Intake    │  Parse     │ Reconcile  │  Examine   │  Signoff   │
   │  分类落库   │ MT700+视觉  │ 字段对账    │ 20 条规则   │ 出最终报告  │
   └────────────┴────────────┴────────────┴────────────┴────────────┘
        │            │            │            │            │
        └────────────┴────PipelineEventBus────┴────────────┘
                                  │
                ┌─────────────────┼─────────────────┐
                ▼                 ▼                 ▼
            SSE 推送           Postgres           Langfuse
        (UI 多 Tab 实时同步)   (lc_v2 schema)    (OTel span)
```

四件事必须刻进脑子：

1. **5 阶段硬门控（hard-gate）**：每一阶段执行完后端置 `awaiting_officer=true` + `next_stage=...`，必须由 UI 调 `POST /stages/{stage}/run` 才会推进。不是 auto-advance。
2. **FieldEnvelope 是唯一字段载体**：没有任何 `Invoice` / `BillOfLading` 这样的领域类。所有字段统一是 `Map<canonical_key, FieldEnvelope{value, confidence, manual...}>`，配置从 `field-pool.yaml` 来。
3. **规则 = YAML**：20 条规则都在 `rules/catalog.yml`，不需要写 Java；PROGRAMMATIC 用 SpEL，AGENT 用 Spring AI ChatClient + StringTemplate prompt。
4. **视觉抽取走裸 RestClient，不走 Spring AI**：4 个并行 slot，多数表决；Spring AI 只负责文本 LLM（规则检查）。

---

## 2. 主流程：纯后端代码级走读

> 本章只看后端，UI 完全忽略。先给 Pipeline 调度骨架（"谁调谁"），再逐 Stage 走"输入 → 关键代码 → 落库产物 → 输出"。每个 Stage 都给一张 mini 调用图 + 文件清单 + 关键源码片段。

### 2.0 顶层调度骨架

#### 调用关系

```
HTTP                       异步执行                           DB / SSE
─────────────────────────────────────────────────────────────────────────
SessionController.create() ──► PipelineService.createSession()
                                       │
                                       ├─ sessionStore.createSession()    →  check_sessions
                                       ├─ eventChannel.channel(id)        →  开 SSE 通道
                                       ├─ traceRegistry.open(id)          →  开 Langfuse root span
                                       ├─ contextCache.put(id, ctx)       →  内存 StageContext
                                       └─ self.runStageAsync(id, ctx, 0)  ╮
                                                                          │ @Async
PipelineControlController.run(stage)                                      ▼
                  └─ PipelineService.runStage(id, stage)         runStageAsync(id, ctx, idx)
                          │                                                │
                          │  校验 next_stage 匹配                            │  traceRegistry.runInSession()
                          │  clearAwaitingOfficer                          │     │
                          └──► self.runStageAsync(id, ctx, idx)            │     ├─ pipeline.runOne(ctx, idx)
                                                                          │     │     │
PipelineControlController.rerun()                                         │     │     └─ stage.execute(ctx)  ←── @PipelineStage AOP 开 span
                  └─ PipelineService.rerunFromStage(id, fromStage)        │     │
                          │  sessionStore.clearDownstreamState              │     ├─ if 末阶段: finalize() (写 signoff/report + COMPLETED)
                          │  resetContextForStage(ctx, fromStage)           │     └─ else: markAwaitingOfficer(stage, nextStage)
                          └──► self.runStageAsync(id, ctx, idx)             │            └─ eventBus.awaitingOfficer(id, nextStage) → SSE
                                                                          ▼
                                                                     LcV2Pipeline.runOne()
                                                                          ├─ if ctx.cancelled → emit + return false
                                                                          ├─ if ctx.fatalError → return false
                                                                          └─ try stage.execute(ctx); catch → ctx.fatalError + emit stageFailed
```

**两条不变量**：
1. **一次 `runStageAsync` 只跑一个 Stage**。完了不会自动跑下一个；只有 `markAwaitingOfficer` 落 `next_stage` 然后 SSE 通知。
2. **`PipelineService.runStageAsync` 通过 `@Lazy self`** 调用，是为了让 Spring 的 `@Async` 代理生效（不绕代理就退化成同步）。

#### 文件清单

| 角色 | 文件 | 关键方法 |
|---|---|---|
| HTTP 入口 | `api/controller/SessionController.java` | `POST /sessions` |
| HTTP 入口 | `api/controller/PipelineControlController.java` | `POST /sessions/{id}/stages/{stage}/run` 与 `/rerun` |
| 生命周期编排 | `pipeline/PipelineService.java` | `createSession` `runStage` `runStageAsync` `rerunFromStage` `finalize` `rehydrateContext` |
| Stage 调度 | `pipeline/LcV2Pipeline.java` | `runOne(ctx, idx)`：取消检查 + try/catch 单 Stage |
| 阶段接口 | `pipeline/Stage.java` | `name()`、`execute(StageContext)` |
| 共享状态 | `pipeline/StageContext.java` | mutable bag：`lc / extracts / reconFields / checkResults / finalReport / cancelled / fatalError` |
| 事件总线 | `pipeline/PipelineEventBus.java` | 包 `ApplicationEventPublisher`；扇出给 SSE + DB + tracing |
| 持久化 | `infra/persistence/SessionStore.java` | `upsertPipelineStep`、`markAwaitingOfficer`、`clearDownstreamState` |

#### 关键源码片段：单 Stage 执行 + 门控

```java
// PipelineService.runStageAsync —— 简化版
@Async
public void runStageAsync(String sessionId, StageContext ctx, int idx) {
    String stageName = pipeline.nameAt(idx);
    traceRegistry.runInSession(sessionId, () -> {       // 把 root span 重新挂到异步线程
        sessionStore.updateStatus(sessionId, stageName.toUpperCase());
        boolean ok = pipeline.runOne(ctx, idx);          // ← 真正跑 Stage
        if (!ok) { ...写失败状态; return; }

        if (idx == pipeline.stageCount() - 1) {          // 末阶段（signoff）
            finalize(sessionId, ctx);                    // 写 signoff/report + COMPLETED
            return;
        }
        // 硬门控：暂停等 officer
        String nextStage = pipeline.nameAt(idx + 1);
        sessionStore.markAwaitingOfficer(sessionId, stageName, nextStage);
        eventBus.awaitingOfficer(sessionId, nextStage);  // → SSE
    });
}
```

```java
// LcV2Pipeline.runOne —— 取消 + 故障兜底
public boolean runOne(StageContext ctx, int idx) {
    Stage stage = stages.get(idx);
    if (ctx.cancelled) { eventBus.sessionCancelled(...); return false; }
    if (ctx.hasFatalError()) return false;
    try { stage.execute(ctx); return true; }
    catch (Exception e) {
        ctx.fatalError = e;
        eventBus.stageFailed(ctx.sessionId, stage.name(), e.getMessage());
        return false;
    }
}
```

#### Rerun / 重水合（恢复语义）

```
rerunFromStage(id, fromStage)
   │
   │ ctx 不在 contextCache（重启或 signoff 后清掉）：
   │   └─ rehydrateContext(id):
   │        ├─ sessionStore.getDocuments()         → 重建 docIds / uploadedDocNames
   │        ├─ s3Store.get(docId)                  → 把 PDF 字节从 MinIO 拉回 ctx.uploadedDocBytes
   │        ├─ sessionStore.getLcParse()           → ctx.lc（含 fields/rawFields/derived）
   │        └─ sessionStore.getDocConsensus()      → ctx.extracts（每 doc 的 consensus envelope）
   │
   │ canRehydrateForStage:
   │   reconcile/examine/signoff: 只要 lc 和 extracts 在就行
   │   parse:                     还要 PDF bytes
   │   intake:                    始终 false（必须新建 session）
   │
   ├─ sessionStore.clearDownstreamState(id, fromStage)   # 删 fromStage 之后的 pipeline_steps 行
   ├─ resetContextForStage(ctx, fromStage)               # 清掉对应的内存字段
   ├─ eventBus.stageRerun(id, fromStage, officerId)
   └─ self.runStageAsync(id, ctx, idx)
```

---

### 2.1 Stage 0 — Intake

#### 流程图

```
PipelineService.createSession(lcText, files)
        │ (本身在主线程，先把 documents/uploadedDocBytes 灌好)
        ▼
runStageAsync(idx=0)
        ▼
IntakeStage.execute(ctx)                                                  pipeline_steps
        │                                                                 ─────────────────
        ├─ 遍历 ctx.uploadedDocNames：
        │     ├─ countPages(bytes)                  ← PDFBox；catch → 1
        │     ├─ sessionStore.createDocument()      ───► documents 行 (docId)
        │     ├─ s3Store.put(docId, bytes)          ───► MinIO 对象
        │     │   (S3FileStore 同时塞 PdfBytesCache 进程内热缓存)
        │     ├─ eventBus.extractionProgress("intake")
        │     └─ 自动 confirm 非 UNKNOWN/LC 的 docType → ctx.confirmedDocTypes
        │
        ├─ if ctx.lcText 有值：                      ← 必填，否则 IllegalStateException
        │     ├─ Mt700Parser.parse(lcText)          → LcParseResult
        │     │   (Prowide Core 解析 SWIFT block 4，
        │     │    DocumentListParser 解 :46A:，
        │     │    IncotermsExtractor 派生 Incoterm class，
        │     │    LcConsistencyChecker 跑 LC_SHIP_AFTER_EXPIRY 等交叉校验)
        │     ├─ ctx.lc = result
        │     └─ persistLc(ctx, result)              ───► intake/lc_parse 一行 JSON
        │
        └─ eventBus.stageCompleted("intake")
```

#### 文件清单

| 文件 | 职责 |
|---|---|
| `stage/intake/IntakeStage.java` | Stage 主体（160 行），三件事：分类落库 / 字节落 S3 / 跑 MT700 |
| `stage/parse/Mt700Parser.java` | SWIFT MT700 解析器；尽管在 `parse/` 包，**调用方是 IntakeStage** |
| `stage/parse/subfield/DocumentListParser.java` | `:46A:` 必备文档清单解析 |
| `stage/parse/subfield/IncotermsExtractor.java` | `:45A:` 描述里抽 Incoterm + 派生 incoterms_class |
| `stage/parse/LcConsistencyChecker.java` | LC 字段间一致性（船期 vs 到期日、转运 vs 港口） |
| `infra/storage/S3FileStore.java` | MinIO 存取；`put` 同时灌进 PdfBytesCache |
| `infra/storage/PdfBytesCache.java` | 进程内 ConcurrentHashMap，Parse 阶段读 |
| `infra/persistence/SessionStore.java` | `createDocument` / `upsertPipelineStep("intake","lc_parse")` |

#### 关键源码片段：MT700 解析落库

```java
// IntakeStage.persistLc —— 让 ctx.lc 跨进程可恢复
private void persistLc(StageContext ctx, LcParseResult lc) {
    Map<String, Object> snapshot = new LinkedHashMap<>();
    snapshot.put("raw_mt700", lc.rawMt700());
    snapshot.put("fields",     lc.envelope() != null ? lc.envelope().fields() : Map.of());
    snapshot.put("rawFields",  lc.rawFields());
    snapshot.put("derived",    lc.derived());          // incoterms_class / tenor / tolerance
    snapshot.put("warnings",   lc.consistencyWarnings());
    sessionStore.upsertPipelineStep(ctx.sessionId, "intake", "lc_parse",
            "SUCCESS", objectMapper.writeValueAsString(snapshot), null, null);
    // ↑ 视图 v_lc_parse 把 fields / rawFields 投影成 controller 直接可读的形状
}
```

#### 输入 / 输出契约

| 项 | 形式 |
|---|---|
| **输入** | `ctx.lcText`（必填）、`ctx.uploadedDocBytes: Map<DocType, byte[]>`、`ctx.uploadedDocNames` |
| **写入 ctx** | `ctx.docIds: Map<DocType, dbDocId>`、`ctx.confirmedDocTypes`、`ctx.lc: LcParseResult` |
| **写入 DB** | `documents` N 行；`pipeline_steps(intake/lc_parse)` 1 行 |
| **写入 S3** | 每个非 LC 文件一个对象 |
| **SSE** | `StageStarted("intake")` → 多个 `ExtractionProgress` → `StageCompleted` |
| **失败模式** | LC 文本缺失 → `IllegalStateException` 透传到 `runOne` 的 catch；PDF 解析失败 → page count 1（**静默**） |

---

### 2.2 Stage 1 — Parse（视觉抽取）

#### 流程图

```
ParseStage.execute(ctx)                  ← @PipelineStage AOP 开 "parse" span
   │
   ├─ 收集 toExtract = ctx.uploadedDocBytes.keys ∖ {LC, UNKNOWN}
   │   按 DocType.ordinal() 排（INV → BOL → PKL → BOE → BC → WC）
   │
   ├─ for each docType in toExtract:                    ← 文档间串行
   │     │   if ctx.cancelled break                     ← 协作式取消点
   │     │
   │     ▼
   │   VisionExtractService.extract(docType, pdfBytes, filename, sessionId, eventBus)
   │     │
   │     ├─ docTypeRegistry.byDocType(dt) → 取 prompt 路径 "extract/inv-extract-vision.st"
   │     ├─ slotConfig.enabledSlots() → 拿 1..4 个 SlotEntry
   │     ├─ 为每个 slot 算 cacheKey = SHA256(pdf + prompt + model + base-url +
   │     │                                    dpi + maxPages + maxLongEdge + version)
   │     ├─ 全 slot 命中缓存 → 直接走，不渲染 PDF
   │     ├─ 否则 renderPdfToBase64(pdfBytes, dpi, maxPages)   ← PDFBox + ImageIO PNG
   │     │
   │     └─ 4 个 slot 并发：
   │         tracingAsync.supplyAsync(() -> self.runSlot(...))   ← @TracedCall("vision.generate")
   │             │
   │             ├─ callVlm(slot, base64Pages, promptText):
   │             │      RestClient.post("/chat/completions") 顶层 body：
   │             │      { model, messages: [{user, content: [text + image_url(base64) ×N]}], max_tokens }
   │             │      若 isQwenFamily(model): + response_format:json_object + enable_thinking:false + temperature:0
   │             ├─ parseResponse(json) → FieldEnvelope（带 raw_quotes / field_confidence）
   │             └─ cache.put(cacheKey, ...)
   │
   ├─ 全 slot 完成后：
   │     consensus = computeConsensus(bySlot, primarySlot)        ← per-key 多数投票
   │     overallConfidence = HIGH(≥3 slots) / MED(2) / LOW(1)
   │     offSchema = extractOffSchemaItems(primarySlot envelope)
   │
   ├─ ctx.extracts.put(docType, DocumentExtract{consensus, bySlot, ...})
   ├─ persistExtract(ctx, docType, extract)
   │     ├─ 每个 slot → pipeline_steps(parse/extract:<DT>:<slot>) 一行
   │     └─ consensus → pipeline_steps(parse/consensus:<DT>) 一行
   │
   └─ eventBus.stageCompleted("parse")
```

#### 文件清单

| 文件 | 职责 |
|---|---|
| `stage/parse/ParseStage.java` | Stage 主体；按 DocType 串行调用 VisionExtractService |
| `stage/parse/VisionExtractService.java` | 多 slot 并发 / 缓存 / 共识；**裸 RestClient，不走 Spring AI** |
| `infra/cache/VisionExtractCache.java` | 持久化抽取缓存（含 raw response + parsed envelope + token 消耗） |
| `infra/cache/CacheKey.java` | SHA256 组合 cache key |
| `infra/config/ExtractorSlotConfig.java` | 加载 `vision-llm.slot-N.*` 配置 → SlotEntry |
| `infra/fields/DocTypeRegistry.java` | `doc-type-registry.yaml`：DocType → 抽取 prompt 路径 |
| `infra/observability/TracedCall.java` + `TracedCallAspect.java` | 给 `runSlot` 自动开 span |
| `prompts/extract/<dt>-extract-vision.st` | 每个 doc 类型一份视觉 prompt |

#### 关键源码片段：Qwen 家族特判 + 请求体形状

```java
// VisionExtractService.callVlm
Map<String, Object> body = new LinkedHashMap<>();
body.put("model", slot.getModel());
body.put("messages", List.of(Map.of("role", "user", "content", contentParts))); // text + N 张 image_url
body.put("max_tokens", 4096);

if (isQwenFamily(slot.getModel())) {
    body.put("response_format", Map.of("type", "json_object")); // 强制 JSON
    body.put("enable_thinking", false);                         // 抑制 CoT 漏到 content
    body.put("temperature", 0);                                 // 命中 cache 必须确定性
}
return client.post().uri("/chat/completions")
        .contentType(MediaType.APPLICATION_JSON).body(body)
        .retrieve().body(String.class);

private static boolean isQwenFamily(String model) {
    return model != null && model.toLowerCase().startsWith("qwen");
}
```

#### 关键源码片段：多数投票共识（关键边界算法）

```java
// VisionExtractService.computeConsensus —— per-field 投票
for (String key : allKeys) {
    Map<Object, Integer> votes = new LinkedHashMap<>();
    for (var slot : bySlot.entrySet()) {
        Object v = slot.getValue().get(key);
        if (v != null) votes.merge(v, 1, Integer::sum);
    }
    int topVotes = max(votes.values());
    boolean tied = (votes 中 == topVotes 的候选数 > 1);
    Object winner = tied
        ? <平票时选置信度最高的；都没置信度 → primarySlot 的值>
        : <最高票>;
    // 聚合置信度：所有投给 winner 的 slot 取 min（所有人都同意但所有人都不确定 → 低置信度）
    builder.put(key, FieldValue.of(winner, aggMinConf, primaryRawQuote));
}
```

#### 输入 / 输出契约

| 项 | 形式 |
|---|---|
| **输入** | `ctx.uploadedDocBytes`、`ctx.docIds`（Intake 阶段填好） |
| **写入 ctx** | `ctx.extracts: Map<DocType, DocumentExtract>` |
| **写入 DB** | `pipeline_steps(parse/extract:<DT>:<slot>)` 多行 + `parse/consensus:<DT>` 一行 / 每个 doc |
| **SSE 子状态** | `rendering_pdf → rendered_N_pages → cache_hit \| calling_<model> → parsing_response → complete \| failed:<msg>` |
| **失败语义** | 单 slot 失败被 `runSlot` catch 返回 null → 共识仍可形成；**全 slot 失败 → 该 doc `bySlot.isEmpty()` → DB 标 `FAILED` 但流水线继续**（潜在风险：下游规则大面积 NA） |

---

### 2.3 Stage 2 — Reconcile（机械对账，无 LLM）

#### 流程图

```
ReconcileStage.execute(ctx)
   │
   ├─ canonical = fieldPool.reconcileCanonical()    ← field-pool.yaml 中标了 reconcile_canonical 的字段
   │
   ├─ for each FieldDefinition fd in canonical:
   │     ├─ 取 LC 值：lcVal = ctx.lc.envelope().get(fd.key())
   │     ├─ for each (DocType dt, DocumentExtract ext) in ctx.extracts:
   │     │     docVal = ext.consensus().get(fd.key())
   │     │     if lcVal == null      → cellStatus = NA
   │     │     elif docVal blank     → cellStatus = MISSING + detail "expected per LC"
   │     │     else                  → cmp = ReconcileNormaliser.compare(fd.type(), lcVal, docVal)
   │     │                             cellStatus = MATCH | TOLERANCE | DISCREPANCY | MISSING
   │     │
   │     ├─ rowStatus = worstOf(cellStatus, excludeLc)
   │     │   优先级：DISCREPANCY > TOLERANCE > MISSING > MATCH > NA
   │     │
   │     └─ 输出一条 ReconField { fieldKey, valueByDocType, cellStatus, cellDetail, status, … }
   │
   ├─ ctx.reconFields = fields
   └─ persistRows(ctx, fields)
         └─ for each f → pipeline_steps(reconcile/field:<key>) 一行
                          { label, group(Money/Transport/Goods/Identity/Compliance/Insurance/Other),
                            row_verdict, value_by_doc_type, cell_status, cell_detail }
```

#### 文件清单

| 文件 | 职责 |
|---|---|
| `stage/reconcile/ReconcileStage.java` | Stage 主体；矩阵计算 + 落库 |
| `stage/reconcile/ReconcileNormaliser.java` | 归一化 + 对比；金额 ±10% 容差 |
| `infra/fields/FieldPoolRegistry.java` | `field-pool.yaml`：哪些字段是 reconcile_canonical |

#### 关键源码片段：Cell 比对算法

```java
// ReconcileStage.execute（核心循环）
for (FieldDefinition fd : canonical) {
    Object lcVal = ctx.lc != null ? ctx.lc.envelope().get(fd.key()) : null;

    for (var entry : ctx.extracts.entrySet()) {
        DocType dt = entry.getKey();
        Object docVal = entry.getValue().consensus().get(fd.key());

        if (lcVal == null)              cellStatus.put(dt, NA);
        else if (docVal == null)        cellStatus.put(dt, MISSING);
        else {
            var cmp = normaliser.compare(fd.type(), lcVal, docVal);  // ← 类型驱动
            cellStatus.put(dt, mapVerdict(cmp.verdict()));
        }
    }
    // 行级 verdict = 单元最差（LC 单元不参与）
    ReconField.ReconStatus rowStatus = worstOf(cellStatus, /*excludeLc*/ true);
}
```

```java
// ReconcileNormaliser 内部分支（伪代码示意）
switch (fd.type()) {
    case STRING   -> normalise = lower + trim + NFD + 去多余空白
    case CURRENCY -> 符号 ↔ ISO（$/USD、￥/CNY...）
    case DATE     -> 9 种 formatter 解析成 LocalDate 后比
    case AMOUNT   -> BigDecimal 比较；|a-b|/a ≤ 0.10 → TOLERANCE（UCP 30(b)）
    case UNIT     -> kg/kilo/kilogram 等同义词组等价
}
```

#### 输入 / 输出契约

| 项 | 形式 |
|---|---|
| **输入** | `ctx.lc.envelope()`、`ctx.extracts[*].consensus()` |
| **写入 ctx** | `ctx.reconFields: List<ReconField>` |
| **写入 DB** | `pipeline_steps(reconcile/field:<key>)` 一行 / canonical 字段（视图：`v_reconcile_rows`） |
| **关键边界** | **此处不调 LLM**。语义符合性（ISBP C3 "corresponds to"）扔给 Examine 的 AGENT 规则，绝不在这里偷判。Officer 在 UI 决定每个非 MATCH 单元（落 `officer_actions(cell_decision)`），与本 Stage 无关。 |

---

### 2.4 Stage 3 — Examine（规则裁决）

#### 流程图

```
ExamineStage.execute(ctx)                                ← @PipelineStage AOP 开 "examine" span
   │
   ├─ 0a. ctx.lc == null → rehydrateLc(sessionId)       ← 从 v_lc_parse 重建（防 JVM 重启）
   ├─ 0b. ctx.lc != null → re-derive(LcDerived)         ← 重新派生 incoterms / tolerance / tenor
   │
   ├─ 1. ec = buildContext(ctx)
   │      ExamineContext { lcFields, lcDerived, presentedDocTypes, consistencyClauses }
   │      （presentedDocTypes 优先取 ctx.extracts；空再回落 documents 表）
   │
   ├─ 2. for each Rule in catalog.enabledRules():
   │       d = ruleTriggerEvaluator.evaluate(rule, ec)   ← 复合布尔 (all_of/any_of/not + docs_present + lc_field_present + ...)
   │       traces[ruleId] = d.trace()
   │       outcome ∈ { FIRE | NOT_APPLICABLE | SKIP }
   │
   │     按 tier 排（PROG=0 < AGENT=1 < AGENT_TOOL=2 < AGENTIC=3），同 tier 保 catalog 顺序
   │
   ├─ 3. for each rule (顺序)：先 upsert PENDING 行（让 worklist 立刻有占位）
   │       ├─ FIRE           → runRule(rule, idx, total)
   │       │                    │
   │       │                    ├─ rule.isProgrammatic() → SpelEvaluator.evaluate(rule, ctx)
   │       │                    │     ├─ buildContext: spelCtx.set("lc", ctx.lc.envelope().fields())
   │       │                    │     │                  spelCtx.set("docs", Map<docType.name, fields>)
   │       │                    │     │                  spelCtx.set("presentationDate", today ISO)
   │       │                    │     ├─ PARSER.parseExpression(rule.expression()).getValue(spelCtx)
   │       │                    │     ├─ 返回 Map{verdict, explanation, confidence, condition_results[]} → 直读
   │       │                    │     └─ 返回 boolean → true=PASS / false=FAIL
   │       │                    │
   │       │                    └─ else → AgentRuleExecutor.execute(rule, ctx)
   │       │                          │
   │       │                          │ Observation.createNotStarted("rule." + ruleId).start()
   │       │                          │   └─ tagSpan(rule_id, langfuse.session.id, ...)
   │       │                          │
   │       │                          ├─ AGENT      → callPlain         （ChatClient 单次 call）
   │       │                          ├─ AGENT_TOOL → callWithTools(cap=min(rule.maxIter, 3), 仅 compute tools)
   │       │                          └─ AGENTIC    → callWithTools(cap=effectiveCap, 全工具)
   │       │
   │       │     callWithTools 是手写 agent loop（关键）：
   │       │        internalToolExecutionEnabled(false)   ← 关掉 Spring AI 自带的循环
   │       │        for iter in 1..cap:
   │       │            response = chatModel.call(prompt(messages, options))
   │       │            assistant = response.output
   │       │            if !assistant.hasToolCalls(): return parseResponse(...)   ← 终态 JSON
   │       │            if iter == cap: return NEEDS_REVIEW("max_iterations reached")
   │       │            messages = toolCallingManager.executeToolCalls(prompt, response)
   │       │                                              ↑ 真正执行 ExamineToolRegistry 中的 @Tool
   │       │
   │       │     parseResponse 期望 JSON：{verdict, explanation, confidence, condition_results[]?}
   │       │     extras：tool_calls（ThreadLocal beginCapture/endCapture 收集）
   │       │
   │       └─ NOT_APPLICABLE → emitNa(rad, idx, total)
   │             CheckResult { NOT_APPLICABLE, explanation = trigger trace + 引导到 DOCSET-01 }
   │
   ├─ 4. for SKIP 列表 → emitSkipped：{ NOT_APPLICABLE, explanation = "[OUT_OF_SCOPE] " + trace }
   │
   ├─ 每条规则结果都 appendCheckResult(ctx, r):
   │     pipeline_steps(examine/<ruleId>) UPSERT
   │     { verdict, check_type, explanation, confidence, duration_ms, trigger_trace,
   │       tool_calls?, condition_results? }
   │
   └─ persistResults(ctx) → pipeline_steps(examine/meta)
         { trigger_traces: {ruleId: [...]}, consistency: [...] }
```

#### 文件清单

| 文件 | 职责 |
|---|---|
| `stage/examine/ExamineStage.java` | Stage 主体；trigger 分类 + tier 排序 + 调度 |
| `infra/rules/RuleCatalogRegistry.java` | 启动加载 `rules/catalog.yml`；refs 校验 fail-fast |
| `infra/rules/RuleTriggerEvaluator.java` | 复合布尔表达式 → FIRE/NA/SKIP + trace |
| `stage/examine/SpelEvaluator.java` | PROGRAMMATIC：SpEL + `MultiDocHelpers` 静态方法 |
| `stage/examine/MultiDocHelpers.java` | 跨 doc 日期/数量等通用比较，返回结构化 Map |
| `stage/examine/AgentRuleExecutor.java` | AGENT / AGENT_TOOL / AGENTIC 的 ChatClient 调用 + 手写 agent loop |
| `stage/examine/tools/ExamineToolRegistry.java` | `@Tool getLcField / getDocField / calculateDateDiff / verifyArithmetic` |
| `infra/refs/ArticleRefRegistry.java` | UCP/ISBP 条文文本注入 prompt（`{{ref.UCP-14-c.text}}`） |
| `infra/config/LlmBudgetProperties.java` | `app.llm.max-iterations` 默认 3 |
| `prompts/system/check-system-{base,tools,agentic}.st` | 三套 system prompt（按 tier 选） |
| `prompts/check/<RULE_ID>.st` | 每条规则的业务 prompt |

#### 关键源码片段：Trigger 三分支输出

```java
// ExamineStage.execute（节选）
for (Rule rule : catalog.enabledRules()) {
    TriggerDecision d = triggerEvaluator.evaluate(rule, ec);
    traces.put(rule.ruleId(), d.trace());
    switch (d.outcome()) {
        case FIRE           -> classified.add(new Classified(rule, FIRE, null));
        case NOT_APPLICABLE -> classified.add(new Classified(rule, NA,   new RuleAndDecision(rule, d)));
        case SKIP           -> skipList.add(new RuleAndDecision(rule, d));
    }
}
classified.sort(comparingInt(c -> tierOrder(c.rule().checkType())));

for (Classified c : classified) upsertPendingRow(ctx, c.rule()); // 让 worklist 立刻有 PENDING 行
```

#### 关键源码片段：手写 Agent Loop（财务安全核心）

```java
// AgentRuleExecutor.callWithTools —— 严格次数硬上限
OpenAiChatOptions options = OpenAiChatOptions.builder()
        .toolCallbacks(tools)
        .internalToolExecutionEnabled(false)        // ← 关键：关掉 Spring AI 的内置循环
        .build();

List<Map<String, Object>> toolCalls = toolRegistry.beginCapture();
int iterations = 0;
while (iterations < maxIterations) {
    iterations++;
    Prompt prompt = new Prompt(messages, options);
    ChatResponse response = chatModel.call(prompt);
    AssistantMessage assistant = response.getResult().getOutput();

    if (!assistant.hasToolCalls()) {                // 终态：模型返回最终 JSON
        return parseResponse(rule.ruleId(), rule.checkType(),
                             assistant.getText(), new ArrayList<>(toolCalls));
    }
    if (iterations >= maxIterations) {              // 用尽预算
        return new CheckResult(rule.ruleId(), Verdict.NEEDS_REVIEW,
                "max_iterations (" + maxIterations + ") reached without terminal verdict; "
              + "tool_rounds=" + toolCalls.size(),
                null, 0.0, rule.checkType(), new ArrayList<>(toolCalls), null);
    }
    // 让 ToolCallingManager 真正执行工具，并把结果回灌到对话历史里
    ToolExecutionResult toolResult = toolCallingManager.executeToolCalls(prompt, response);
    messages = new ArrayList<>(toolResult.conversationHistory());
}
```

#### 关键源码片段：SpEL 上下文 + 结构化返回

```java
// SpelEvaluator.evaluate（节选）
Object raw = PARSER.parseExpression(rule.expression()).getValue(spelCtx);

if (raw instanceof Map<?, ?> m && m.get("verdict") != null) {
    // helper 风格：MultiDocHelpers.docDatesValid 返回
    //   { verdict: "PASS" | "FAIL" | "DOUBTS", explanation, confidence, condition_results: [...] }
    var verdict = CheckResult.Verdict.valueOf(String.valueOf(m.get("verdict")).trim());
    return new CheckResult(rule.ruleId(), verdict,
            (String) m.get("explanation"),
            buildEvidence(rule, ctx),
            ((Number) m.get("confidence")).doubleValue(),
            "PROGRAMMATIC", null, (List<Map<String, Object>>) m.get("condition_results"));
}
// 兜底：纯布尔表达式 true=PASS / false=FAIL
```

#### CheckResult Verdict 全集（贯穿后续阶段）

| Verdict | 何时 | 影响 compliant |
|---|---|---|
| `PASS` | 规则通过 | ✓ |
| `FAIL` | 规则不通过 | ✗ |
| `DOUBTS` | LLM 不确定 / SpEL 异常 | ✗ |
| `NEEDS_REVIEW` | Agent loop 用尽预算 | ✗（在 Signoff 不参与 compliant 但走 doubts 通道） |
| `NOT_APPLICABLE` | trigger 命中 NA / SKIP | 不影响 |
| `FAILED` | 异常兜底（持久化失败、LLM 异常） | ✗ |

#### 输入 / 输出契约

| 项 | 形式 |
|---|---|
| **输入** | `ctx.lc`（必要时从 `v_lc_parse` 重水合）、`ctx.extracts`、`catalog.enabledRules()` |
| **写入 ctx** | `ctx.checkResults: List<CheckResult>` |
| **写入 DB** | `pipeline_steps(examine/<ruleId>)` 每条规则一行 + `examine/meta` 一行（trigger trace + consistency） |
| **SSE** | `RuleStarted(idx, total, ruleId, checkType)` → `RuleChecked(verdict, confidence, trace)` |
| **关键审计点** | trigger trace 当前**只在内存**（`ExamineStage.traces` 字段），仅在 `examine/meta` 落了一行；如果 rerun 仅从 signoff 起，这次 examine 的 trace 不会被覆盖（因为 step_key 不同），但 in-memory 的旧 trace 会被 `traces.clear()` 抹掉 |

---

### 2.5 Stage 4 — Signoff

#### 流程图

```
SignoffStage.execute(ctx)
   │
   ├─ failCount   = ctx.checkResults.filter(FAIL).count
   ├─ doubtsCount = ...DOUBTS
   ├─ passCount / naCount
   │
   ├─ compliant = (failCount == 0 && doubtsCount == 0)   ← 注意：NEEDS_REVIEW / FAILED 的入账方式见下方风险表
   │
   ├─ ctx.finalReport = {
   │     compliant,
   │     summary: { total, pass, fail, doubts, not_applicable },
   │     results: [ { ruleId, verdict, explanation, confidence, checkType }, ... ]
   │   }
   │
   ├─ eventBus.sessionCompleted(sessionId, compliant, failCount)
   └─ eventBus.stageCompleted("signoff")

   ▼ （回到 PipelineService.runStageAsync 的 finalize 分支）

PipelineService.finalize(sessionId, ctx)
   ├─ 若 ctx.finalReport 非空 → upsertPipelineStep("signoff", "report",
   │       compliant ? "COMPLIANT" : "DISCREPANT", JSON, null, null)
   ├─ sessionStore.updateCompleted(sessionId, compliant)
   ├─ traceRegistry.end(sessionId, null)               ← 关 Langfuse root span
   └─ 若 sessionStore.isSigned(...) :
         eventChannel.complete(sessionId)              ← 关 SSE 通道
         contextCache.remove(sessionId)                ← 释放内存
```

#### 文件清单

| 文件 | 职责 |
|---|---|
| `stage/signoff/SignoffStage.java` | 聚合 verdict → finalReport（不写 DB，由 PipelineService.finalize 写） |
| `stage/signoff/Mt734Generator.java` | 拒付 SWIFT MT734 文本（被 `SignoffController.getMt734` 调用，不在 stage 流水线里） |
| `api/controller/SignoffController.java` | `GET/POST /signoff`、`GET /mt734`、写 `officer_actions(signoff)` |

#### 关键源码片段：compliant 判定

```java
// SignoffStage.execute（核心 5 行）
long failCount   = results.stream().filter(r -> r.verdict() == Verdict.FAIL).count();
long doubtsCount = results.stream().filter(r -> r.verdict() == Verdict.DOUBTS).count();
boolean compliant = failCount == 0 && doubtsCount == 0;
ctx.finalReport = Map.of("compliant", compliant, "summary", ..., "results", ...);
ctx.eventBus.sessionCompleted(ctx.sessionId, compliant, (int) failCount);
```

```java
// PipelineService.finalize —— 落库 + 释放
String reportJson = objectMapper.writeValueAsString(ctx.finalReport);
sessionStore.upsertPipelineStep(sessionId, "signoff", "report",
        compliant ? "COMPLIANT" : "DISCREPANT", reportJson, null, null);
sessionStore.updateCompleted(sessionId, compliant);
traceRegistry.end(sessionId, null);
if (sessionStore.isSigned(sessionId)) {        // 仅当 officer 已正式 signoff（officer_actions 表）才清通道
    eventChannel.complete(sessionId);
    contextCache.remove(sessionId);
}
```

#### 输入 / 输出契约

| 项 | 形式 |
|---|---|
| **输入** | `ctx.checkResults` |
| **写入 ctx** | `ctx.finalReport: Map<String, Object>` |
| **写入 DB** | `pipeline_steps(signoff/report)` 一行；`check_sessions.status='COMPLETED'` + `compliant` 列 |
| **SSE** | `SessionCompleted(compliant, discrepancies)` → `StageCompleted("signoff")` |
| **风险点** | `NEEDS_REVIEW` / `FAILED` 这两种 verdict **不会让 compliant=false**（见 SignoffStage:41）；只有 `FAIL` + `DOUBTS` 才计。Examine 里 budget exhausted 的 NEEDS_REVIEW 会被悄悄当 "通过" — 这是评审时要标黑的语义裂缝。 |

---

### 2.6 一张全局数据流参考

```
        intake          parse              reconcile         examine           signoff
        ──────          ─────              ─────────         ───────           ───────
ctx.lcText        ┐
ctx.uploadedDocBytes┼──► ctx.lc          ─► (read)          ─► (read)
ctx.uploadedDocNames┘    ctx.extracts*   ─► (read)          ─► (read)
                                            ctx.reconFields ─► (read)
                                                                ctx.checkResults ─► ctx.finalReport

documents 行                                                                          check_sessions.compliant
pipeline_steps:
    intake/lc_parse                                                                   pipeline_steps:
                       parse/extract:DT:slot                                              signoff/report
                       parse/consensus:DT
                                            reconcile/field:KEY
                                                                examine/<ruleId>
                                                                examine/meta

视图：v_lc_parse · v_doc_extracts_consensus · v_doc_extracts_slots · v_reconcile_rows · v_examine_phases · v_check_results · v_examine_meta · v_signoff_report
```

`*ctx.extracts` 是 Parse 阶段唯一的内存产物；重启后 `rehydrateContext` 用 `v_doc_extracts_consensus` 还原（仅 consensus，**不还原 per-slot**）。

---

## 3. 模块深入 —— 看代码该看哪几行

### 3.1 后端关键定位表

| 关心什么 | 看文件 | 重点行 |
|---|---|---|
| 主控循环 / 阶段调度 | `pipeline/LcV2Pipeline.java` | `runOne()` 67-88：执行 + 取消标志检查 |
| Officer 门控落库 | `pipeline/PipelineService.java` | `runStageAsync` 160-197；`rerunFromStage` 237-272 |
| 阶段上下文（黑盒包） | `pipeline/StageContext.java` | `cancelled` volatile；`reconLocked` **只在内存，重启丢** |
| AOP 链路 | `infra/observability/PipelineTracingAspect.java` + `@PipelineStage` | 阶段 span 自动开/关；阶段实现里完全没有 tracer 字眼 |
| 事件总线 | `pipeline/PipelineEventBus.java` + `infra/stream/PipelineEventChannel.java` | ring buffer 512、`@Async` listener、15s 心跳、`X-Accel-Buffering: no` |
| 持久层 | `infra/persistence/SessionStore.java` | UPSERT(session,stage,step_key) 幂等；`clearDownstreamState` 263 |
| 视觉抽取 | `stage/parse/VisionExtractService.java` | `isQwenFamily()` 判断；并发 + 多数表决；缓存 key 含 version 字段 |
| 规则触发 | `infra/rules/RuleTriggerEvaluator.java` | `all_of/any_of/not` + `docs_present/lc_field_present/derived_equals` 等节点 |
| 规则注册 | `infra/rules/RuleCatalogRegistry.java` | 启动时载入；refs 不通过会 fail-fast |
| Tool 注册 | `stage/examine/tools/ExamineToolRegistry.java` | `@Tool` 方法；ThreadLocal 捕获调用日志 |
| Spring AI 包装 | `infra/llm/LlmConfig.java` + `SanitizingChatModel.java` | `@Primary` 包一层去掉控制字符 |

### 3.2 API 接口速查

| Controller | 关键端点 |
|---|---|
| `SessionController` | `POST /sessions` 上传、`GET /sessions/{id}` 详情、`GET /sessions` 列表 |
| `PipelineControlController` | `POST /sessions/{id}/stages/{stage}/run`、`/rerun` |
| `DocumentsController` | `GET /documents/{docId}/pdf`（带 ETag + 30 天缓存）、`/extracts`、`PATCH`、`POST /fields/{key}/correction` |
| `ReconcileController` | `GET /reconcile`、`POST/DELETE /cell-decision`、`POST /lock`、`POST /unlock` |
| `RulesController` | `GET /rules`、`POST/DELETE /rules/{ruleId}/override` |
| `SignoffController` | `GET/POST /signoff`、`GET /mt734` |
| `StreamController` | `GET /stream` SSE、`GET /events` 历史回放 |
| `LcController` | `GET /lc`、`/lc/required-docs` |
| `PresetsController` | `GET /presets`、`/presets/{id}/files/{name}` |
| `RefsController` | `GET /refs/{id}` UCP/ISBP 条文 |

### 3.3 前端关键定位表

| 关心什么 | 看文件 | 重点 |
|---|---|---|
| 5 阶段路由 / 着陆 | `pages/SessionPage.jsx:35-99` | `landingTarget` 142-152 + 6s 轮询等 `awaiting_officer`（167-216） |
| SSE 主 hook | `hooks/useSse.js:19-176` | `seenSeqRef` 基于 `msg.seq` 去重防回放重复；2s 重连无退避 |
| 数据 hook 集 | `hooks/use{Session,Lc,Reconcile,Rules,Signoff,DocExtracts,DocActions}.js` | useRules 在 EXAMINE 状态 2s 轮询；其它依赖 SSE 事件计数触发 refresh |
| Stage 面板 | `components/stages/{Intake,Parse,Reconcile,Examine,Signoff}Panel.jsx` | ParsePanel 用 react-pdf；ExaminePanel 内嵌 RuleDrawer + saved views |
| 多 Tab 同步 | `useSse` 推 `officerActions[]` → 各 hook 监听 length 变化 refresh | 没有 optimistic update，依赖 REST refetch |
| FieldEnvelope 解包 | `lib/fieldEnvelope.js` | `extractValue/extractConf`（confidence > 0.9 ⇒ HIGH） |
| Officer ID | `lib/officer.js` | **硬编码 'A. Wijaya'** |
| 管理后台 | `src/admin/*` | 独立路由 `/admin/*`，规则/字段/Prompt 治理 + AssistantDrawer（AI 协作改 YAML） |

---

## 4. 关键技术专题

### 4.1 Spring AI（仅用于文本 LLM）

`application.yml` 只用 `spring.ai.openai.*`：

```yaml
spring.ai.openai:
  base-url: ${LLM_BASE_URL}
  api-key:  ${LLM_API_KEY}
  chat.options:
    model: ${LLM_MODEL}
    temperature: 0.0
    max-tokens: 10000
    additional-model-request-fields:
      enable_thinking: false   # ← 顶层注入，Qwen3 兜底
```

设计要点：
- `LlmConfig` 把自动装配的 `OpenAiChatModel` 包成 `SanitizingChatModel` + `@Primary`，所有 ChatClient 走它，统一去除控制字符
- 切换大模型厂商 = 改 3 个环境变量（base-url / api-key / model），不动代码
- 视觉模型**完全不走 Spring AI**——因为多模态 + 多 slot 并发 + 自定义请求体（`enable_thinking`、`response_format`）和 Spring AI 抽象冲突，作者刻意降级到裸 `RestClient`

### 4.2 LLM Prompt 体系

```
prompts/
├── system/
│   ├── check-system-base.st        ← 所有 AGENT 规则共享
│   ├── check-system-tools.st       ← AGENT_TOOL 加成
│   └── check-system-agentic.st     ← AGENTIC 加成
├── check/
│   └── <RULE_ID>.st                ← 每条规则一份业务 prompt
└── extract/
    └── <doctype>-extract-vision.st ← 每种文档一份视觉抽取 prompt
```

关键约定：
- `.st` = StringTemplate，运行时占位符替换
- `{{ref.UCP-14-c.text}}` 由 `ArticleRefRegistry` 在拼 prompt 时注入条文原文，**避免 LLM 凭记忆引用条款**
- 输出强制 JSON：`{verdict, explanation, confidence, condition_results[]}`；`SanitizingChatModel` 兜底过滤 thinking 标签
- 视觉 prompt 列出该 doc 类型期望的 canonical field，模型可在 `off_schema_items[]` 里报告"看到了但没在 schema 里"的内容

### 4.3 规则配置（`rules/catalog.yml`）

最小完整字段：
```yaml
- rule_id: DATE-01
  name: Doc dates within valid window
  check_type: PROGRAMMATIC      # PROGRAMMATIC | AGENT | AGENT_TOOL | AGENTIC
  severity: MAJOR
  scope: [INV, BOL, PKL, BOE, BC, WC]
  triggers:                      # 复合布尔
    any_of:
      - docs_present: [INV]
      - docs_present: [BOL]
  lc_fields_required: []
  ucp_refs: [UCP-14-c, UCP-14-i]
  isbp_refs: []
  expression: |                  # PROGRAMMATIC 必填
    T(...MultiDocHelpers).docDatesValid(#docs, T(java.time.LocalDate).parse(#presentationDate))
  enabled: true
```

加规则的标准动作：
1. 去 `field-pool.yaml` 确认要用的 canonical key 都已声明
2. 决定 check_type：能用确定逻辑写出来的就 PROGRAMMATIC（最快、最便宜、可单测）
3. AGENT 类规则要新建 `prompts/check/<id>.st`，并在 `triggers` 里准确收敛 doc 集合（避免无关文档把 prompt 撑爆）
4. 启动时 `RuleCatalogRegistry` 会校验 refs 存在、check_type 合法；任何错误启动失败

### 4.4 字段配置三件套

| YAML | 谁读 | 干什么 |
|---|---|---|
| `field-pool.yaml` | `FieldPoolRegistry` | 定义所有 canonical 字段（key/type/applies_to/aliases），是 Reconcile pivot 的元数据 |
| `lc-tag-mapping.yaml` | `TagMappingRegistry` | SWIFT tag → canonical key（让 `Mt700Parser` 不写硬编码 if-else） |
| `doc-type-registry.yaml` | `DocTypeRegistry` | 每个 doc 类型用哪个 vision prompt、抽哪些 field |

### 4.5 持久化设计的优雅处

- `pipeline_steps` 用 `(session_id, stage, step_key)` 唯一键 + UPSERT → 任意 rerun 都是天然幂等
- `officer_actions` append-only，"当前状态" 全部走视图（`v_cell_decisions / v_rule_overrides / v_lock_state`），latest-wins per target → 自带审计 + 自带 undo（往里 append `*_cleared`）
- Controller **只读视图**，从不直接读 JSONB → JSON shape 演进无侵入

### 4.6 可观测性的零侵入

- 阶段类里完全看不到 `tracer.startSpan()`，全靠 `@PipelineStage` AOP；`@TracedCall("vision.generate")` 同理
- `SessionTraceRegistry.runInSession()` 把 root span 挂到异步线程，保证一个 session 一棵 trace 树
- `LlmOnlySpanFilter` 只导出 `gen_ai.*` span 给 Langfuse，OTel 噪音被压住

---

## 5. 规则四档（checkType）执行模式深度解析

> 本章只回答一个问题：**一条 catalog.yml 里的规则，是怎么从一行 YAML，变成 ctx.checkResults 里的一条 CheckResult（含 verdict / explanation / confidence / condition_results / tool_calls）的？**
> 四档：`PROGRAMMATIC`、`AGENT`、`AGENT_TOOL`、`AGENTIC`。每一档配套不同的 prompt 加成、不同的 tool 集合、不同的迭代预算、不同的子结果聚合方式。

### 5.1 四档总览（一张对照表）

| 维度 | PROGRAMMATIC | AGENT | AGENT_TOOL | AGENTIC |
|---|---|---|---|---|
| 执行器 | `SpelEvaluator` | `AgentRuleExecutor.callPlain` | `AgentRuleExecutor.callWithTools(cap=min(rule.maxIter,3), 仅 compute tools)` | `AgentRuleExecutor.callWithTools(cap=effectiveCap, 全工具)` |
| 计算载体 | SpEL + `MultiDocHelpers` 静态方法 | Spring AI `ChatClient.call()` 单次 | `ChatModel.call()` 手写 loop（关掉 Spring AI 内置循环） | 同左 |
| LLM 调用次数 | 0 | 1 | ≤ 3 | ≤ `rule.max_iterations`（默认 4，业务可调高，COND-47A=6） |
| System Prompt | — | `check-system-base.st` | base + `check-system-tools.st` 加成 | base + `check-system-agentic.st` 加成 |
| User Prompt | YAML 里的 `expression` | `prompts/check/<RULE_ID>.st`（被 `buildPrompt` 裹一层） | 同左 + tool hint 段（"Tools available: …"） | 同左 + tool hint 段（**强烈推荐 `getAllExtractedFields` 一次抓全**） |
| 可用 Tool | — | — | `calculateDateDiff` / `verifyArithmetic`（仅算术，**字段查询故意屏蔽**因为 prompt 已 inline） | 全集：`getAllExtractedFields` ★ / `getLcField` / `getDocField` / `getDocInventory` / `listPresentedDocs` / `calculateDateDiff` / `verifyArithmetic` |
| 子结果（condition_results） | helper 自己拼，例：`MultiDocHelpers.docDatesValid` 返每文档一项 | 通常无 | 通常无 | **核心机制**——LLM 必须返 `condition_results[]`，服务端按 worst-of 重新聚合 verdict |
| 服务端 verdict 改写 | 不改写 | 不改写 | 不改写 | 有：`aggregateFromConditions` 比 LLM 顶层 verdict 更权威 |
| 配额耗尽时 | SpEL 异常 → `DOUBTS` | LLM 异常 → `FAILED` | 同 AGENTIC（≥3 turn 仍 toolCall）→ `NEEDS_REVIEW` | 用满 turn 仍未给终态 JSON → `NEEDS_REVIEW`，evidence 里挂 `tool_calls` 时间线 |
| 当前 catalog 数量 | 11 | 5 | 2（DATE-02、AMT-01） | 1（COND-47A） |
| 典型例子 | DATE-01、AMT-02、TRANS-01 | GOODS-01、CERT-02、BC-01 | DATE-02、AMT-01 | COND-47A |

### 5.2 共通骨架：从 YAML 到 CheckResult 的三阶段

不论哪一档，都要走三步：

```
                ┌────────────────────────────────────────────────────────┐
                │              ① TRIGGER（决定要不要算）                  │
                │  RuleTriggerEvaluator.evaluate(rule, ec) → FIRE/NA/SKIP │
                └────────────────────────────────────────────────────────┘
                                     │
                                     │ FIRE
                                     ▼
                ┌────────────────────────────────────────────────────────┐
                │           ② DISPATCH（按 checkType 分流）               │
                │   PROGRAMMATIC → SpelEvaluator                          │
                │   AGENT/AGENT_TOOL/AGENTIC → AgentRuleExecutor         │
                └────────────────────────────────────────────────────────┘
                                     │
                                     ▼
                ┌────────────────────────────────────────────────────────┐
                │     ③ NORMALISE（统一成 CheckResult 入 ctx）            │
                │   { ruleId, verdict, explanation, confidence,           │
                │     checkType, toolCalls?, conditionResults? }          │
                └────────────────────────────────────────────────────────┘
```

**FIRE 之外的两条短路**（W5 契约）：
- `NOT_APPLICABLE` → `ExamineStage.emitNa` 直接生成 `CheckResult(NOT_APPLICABLE, explanation=trigger trace)`，不进 evaluator
- `SKIP` → `emitSkipped` 直接生成 `CheckResult(NOT_APPLICABLE, "[OUT_OF_SCOPE] " + trace)`，不进 evaluator

### 5.3 PROGRAMMATIC：SpEL + Helper

#### YAML 配置形态（DATE-01 完整体）

```yaml
- rule_id: DATE-01
  name: Doc dates within valid window
  version: 1
  canonical_field: document_date
  applies_to: [INV, BOL, PKL, BOE, BC, WC]
  scope:      [INV, BOL, PKL, BOE, BC, WC]
  triggers:
    any_of:
      - docs_present: [INV]
      - docs_present: [BOL]
      ...
  lc_fields_required: []
  check_type: PROGRAMMATIC          # ← 关键
  severity: MAJOR
  ucp_refs: [UCP-14-c, UCP-14-i]
  field_keys: [invoice_date, bl_date, pkl_date, boe_date, bc_date, wc_date, document_date]
  expression: |                     # ← 关键：SpEL 表达式
    T(com.lc.v2.checker.stage.examine.MultiDocHelpers).docDatesValid(
      #docs, T(java.time.LocalDate).parse(#presentationDate))
  enabled: true
```

#### SpEL 上下文构造（`SpelEvaluator.buildContext`）

```java
spelCtx.setVariable("lc",   ctx.lc.envelope().fields());                    // Map<String, Object>
spelCtx.setVariable("docs", ctx.extracts → Map<DocType.name(), fields>);    // Map<String, Map<String, Object>>
spelCtx.setVariable("presentationDate", LocalDate.now().toString());        // ISO yyyy-MM-dd
```

→ 表达式里能写：`#lc['credit_currency']`、`#docs['INV']['invoice_total']`、`#presentationDate`

#### 两种返回值约定（`SpelEvaluator.evaluate`）

| 表达式返回 | 处理 |
|---|---|
| `Boolean` | `true → PASS`，`false → FAIL`，无 `condition_results` |
| `Map{verdict, explanation, confidence, condition_results?}` | 直接读 verdict（合法字符串）；非法 verdict → `DOUBTS`；`condition_results` 当 sub-result 落库 |

→ 真正复杂的多文档比对都走 Map 路径，由 `MultiDocHelpers` 拼好。

#### Helper 怎么生成 sub-result（以 currencyConsistent 为例）

```java
// MultiDocHelpers.currencyConsistent —— 节选
for (String docType : CURRENCY_DOC_TYPES) {        // [INV, BOE, INS]
    Map<String, Object> doc = docs.get(docType);
    if (doc == null) continue;
    Object cur = firstNonBlank(doc, "credit_currency", "draft_currency", "currency");
    if (cur == null) { notes.add(docType + ": no currency field extracted"); continue; }
    if (cur.toString().trim().equalsIgnoreCase(lcCurrency)) {
        notes.add(docType + ": " + cur + " = LC " + lcCurrency);
    } else {
        failed = true;
        notes.add(docType + ": " + cur + " ≠ LC " + lcCurrency);
    }
}
return result(failed ? "FAIL" : "PASS", notes.toString(), 1.0);
// 复杂 helper（如 docDatesValid）会再返一个 condition_results: [{doc:"INV", date:"2024-..", status:"PASS"}, ...]
```

#### 端到端流程

```
ExamineStage.runRule(rule, idx, total)
   │
   └─ SpelEvaluator.evaluate(rule, ctx)
         │
         ├─ buildContext(ctx)   ← #lc / #docs / #presentationDate
         ├─ PARSER.parseExpression(rule.expression()).getValue(spelCtx)
         │    │
         │    └─ T(MultiDocHelpers).docDatesValid(#docs, today)
         │           → Map{verdict:"FAIL", explanation:"INV: 2024-..", confidence:1.0,
         │                 condition_results:[{doc:"INV", date:..., status:"FAIL"}, ...]}
         │
         └─ 包装成 CheckResult(rule_id, FAIL, explanation, evidence, 1.0,
                                "PROGRAMMATIC", null, condition_results)
```

### 5.4 AGENT：单次 ChatClient 调用

#### YAML 配置形态（GOODS-01）

```yaml
- rule_id: GOODS-01
  name: "Invoice goods description corresponds to :45A:"
  triggers:
    all_of:
      - docs_present: [INV]
      - lc_field_present: [goods_description]
  check_type: AGENT                 # ← 关键
  ucp_refs: [UCP-18-c, UCP-14-e]
  isbp_refs: [ISBP-C3, ISBP-A19]
  field_keys: [goods_description, invoice_total]
```

无 `expression`，无 `max_iterations` —— **默认 1 次 LLM call**。

#### Prompt 拼装（`AgentRuleExecutor.buildPrompt` + `callPlain`）

发出去的 user prompt 大致长这样：

```
Rule: GOODS-01 — Invoice goods description corresponds to :45A:

Rule context — UCP/ISBP basis:
  UCP-18-c: A description of the goods... (ArticleRefRegistry.byId(...).text())
  UCP-14-e: ...
  ISBP-C3: ...
  ISBP-A19: ...

Presented documents: INV, BOL, PKL                ← 来自 ctx.extracts.keySet()

LC fields:                                        ← 只列 rule.fieldKeys() 命中的
  goods_description: 1000 PCS WIDGETS GRADE A

Document fields:
  INV: goods_description=1000 PCS WIDGETS GRADE A, MODEL X-200, invoice_total=15000.00

Compliance check instruction:
<整段 prompts/check/GOODS-01.st 内容，refs.resolve 后 {{ref.UCP-18-c.text}} 已替换>
```

#### `prompts/check/GOODS-01.st` 关键骨架

```
RULE: GOODS-01 — Invoice goods description corresponds to :45A:

AUTHORITY
{{ref.UCP-18-c.id}} — {{ref.UCP-18-c.heading}}
"{{ref.UCP-18-c.text}}"
... (其它 refs 同样模板)

TASK
Determine whether the invoice goods_description "corresponds to" the LC :45A:...
  - ISBP C3: "corresponds to" 不要求逐字相同
  - ISBP A19: 排版/拼写微差可接受
  - UCP 14(e) carve-out: 仅 INV 适用本规则；PKL/BOL 由 XD-02 管

DECISION
- PASS  : invoice description matches LC :45A: in substance ...
- FAIL  : invoice description contradicts LC :45A: ...
- DOUBTS: variation 模棱两可

OUTPUT (strict JSON, no fences):
{"verdict":"PASS|FAIL|DOUBTS","confidence":0.0-1.0,"explanation":"<one sentence quoting both>"}
```

#### `check-system-base.st` 关键约束

```
You are a senior LC examiner ... CDCS ... 15+ years.

Examination principles you ALWAYS apply (ISBP 821 Part A):
  1. Non-contradictory != identical (Art. 14(d))
  2. Common abbreviations / minor typos NOT discrepancies (ISBP A14, A15)
  3. Goods description on docs other than invoice may be general (Art. 14(e))
  4. On-board notation date overrides B/L issuance date
  5. Tolerance precedence (Pitfall 03): :39A: → "about" ±10% → bulk ±5% → exact
  6. Negation language present == discrepancy
  7. Severity grading CRITICAL/MAJOR/MINOR

Verdict semantics: PASS / FAIL / NOT_APPLICABLE / DOUBTS

Output contract — STRICT:
  EXACTLY one JSON object. No prose. No markdown. No code fences.
  {"verdict":"...","explanation":"<sentence citing UCP/ISBP>","confidence":0.0-1.0}
```

#### 执行链路

```
ExamineStage.runRule
   │
   └─ AgentRuleExecutor.execute(rule, ctx)
         │
         ├─ Observation.createNotStarted("rule." + ruleId).start()    ← 让 gen_ai.* span 嵌进来
         │
         └─ callPlain(rule, ctx):
               userPrompt = buildPrompt(rule, ctx, toolHint=false, maxIter=1)
               response   = chatClientBuilder.build().prompt()
                              .system(check-system-base.st)            ← AGENT 用的就是 base
                              .user(userPrompt)
                              .call().content()
               return parseResponse(ruleId, "AGENT", response, /*toolCalls*/null)
                       └─ 解 JSON → CheckResult(verdict, explanation, confidence, "AGENT", null, null)
```

### 5.5 AGENT_TOOL：单轮 tool round 后必须收

#### YAML 配置形态（AMT-01）

```yaml
- rule_id: AMT-01
  name: Invoice amount and currency conform to LC, within tolerance
  check_type: AGENT_TOOL            # ← 关键
  severity: CRITICAL
  ucp_refs: [UCP-18-b, UCP-30-b]
  field_keys:
    - credit_currency
    - credit_amount
    - tolerance_plus
    - tolerance_minus
    - max_amount_flag
    - additional_conditions
    - invoice_total
    - quantity
    - unit_price
  max_iterations: 3                 # ← 显式 cap，被 min(cap, 3) 截断
```

#### prompt 加成（`check-system-tools.st`）—— 关键约束摘抄

```
Tool-use policy (AGENT_TOOL tier — one tool round, then terminate):
  - HARD turn budget of 3 chat completions: ONE round of tool calls,
    then the terminal JSON verdict. Exceeding → NEEDS_REVIEW.
  - Available tools are compute-only (calculateDateDiff / verifyArithmetic).
    NO field-lookup tools — fields are already inlined in the user prompt.
  - Issue every tool call in ONE turn (parallel calls supported).
    AFTER ANY TOOL RESULT RETURNS, your VERY NEXT message MUST be terminal JSON.
  - Treat tool output as authoritative. match:false from verifyArithmetic IS a confident FAIL.
```

#### user prompt 末尾会被 `buildPrompt` 自动加上

```
Tools available: calculateDateDiff(fromIso, toIso) for exact day counts;
verifyArithmetic(quantity, unit_price, total_amount, epsilon) for invoice
header arithmetic. Turn budget for this rule: 3.
When ready, reply with terminal JSON: {"verdict":"…","confidence":…,"explanation":"…"}.
```

#### 工具集筛选逻辑（构造期完成）

```java
// AgentRuleExecutor 构造器
ToolCallback[] all = MethodToolCallbackProvider.builder().toolObjects(toolRegistry).build()
                        .getToolCallbacks();
this.toolCallbacksAll = List.of(all);                          // 给 AGENTIC

List<ToolCallback> compute = new ArrayList<>();
for (ToolCallback cb : all) {
    if (COMPUTE_TOOL_NAMES.contains(cb.getToolDefinition().name()))   // 仅 calculateDateDiff / verifyArithmetic
        compute.add(cb);
}
this.toolCallbacksCompute = List.copyOf(compute);              // 给 AGENT_TOOL
```

#### Loop（与 AGENTIC 共用 `callWithTools`）

```java
OpenAiChatOptions options = OpenAiChatOptions.builder()
        .toolCallbacks(toolCallbacksCompute)                   // 仅算术 tool
        .internalToolExecutionEnabled(false)                   // ★ 关掉 Spring AI 自带循环，自己控
        .build();
List<Message> messages = List.of(new SystemMessage(systemPromptTools),  // base + tools 加成
                                  new UserMessage(userPrompt));

int iter = 0;
while (iter++ < maxIterations) {                                // 实际 ≤ 3
    ChatResponse response = chatModel.call(new Prompt(messages, options));
    AssistantMessage assistant = response.getResult().getOutput();

    if (!assistant.hasToolCalls())                              // ← 模型返了终态 JSON
        return parseResponse(ruleId, "AGENT_TOOL", assistant.getText(), toolCalls);

    if (iter >= maxIterations)                                  // 用尽预算还在调 tool
        return CheckResult(NEEDS_REVIEW, "max_iterations reached; tool_rounds=" + toolCalls.size(),
                           toolCalls=...);

    // 真正执行 tool；toolRegistry 通过 ThreadLocal 把每次调用记进 toolCalls
    ToolExecutionResult result = toolCallingManager.executeToolCalls(prompt, response);
    messages = result.conversationHistory();                    // 把 tool 输出回灌
}
```

#### Tool 实现（`ExamineToolRegistry`）

```java
@Tool(description = "Verify quantity * unit_price ≈ total_amount within rounding tolerance")
public Map<String, Object> verifyArithmetic(
        @ToolParam BigDecimal quantity,
        @ToolParam BigDecimal unitPrice,
        @ToolParam BigDecimal totalAmount,
        @ToolParam(required = false) BigDecimal epsilon) {
    // 标准化 + 比较 + 返回 { match: true/false, computed: ..., delta: ... }
    // beginCapture() 已经 push 了 ThreadLocal 的 list，本次调用结果会被记到 toolCalls
}
```

#### 执行序列（理想 1 轮收口）

```
turn 1: assistant → tool_calls=[verifyArithmetic(qty=100, price=15.0, total=1500.0, eps=0.01)]
  ↓ ToolCallingManager 执行 → result {"match":true, "computed":1500.00, "delta":0.0}
  ↓ messages.append(tool_result)
turn 2: assistant → {"verdict":"PASS","confidence":0.97,"explanation":"INV USD 1500.00 = LC USD 1500.00; arithmetic verified (1500.00). UCP 18(b)."}
  ↓ !hasToolCalls → parseResponse → CheckResult(PASS, explanation, confidence,
                                                 checkType="AGENT_TOOL", toolCalls=[verifyArithmetic(...)])
```

### 5.6 AGENTIC：多轮 + 子结果聚合

唯一在线规则 = **COND-47A**（`:47A:` 附加条件批量审）。

#### YAML 配置形态

```yaml
- rule_id: COND-47A
  name: "Additional conditions (:47A:) compliance"
  triggers:
    all_of:
      - lc_field_present: [additional_conditions]
  check_type: AGENTIC               # ← 关键
  severity: MAJOR
  ucp_refs: [UCP-14-a, UCP-14-d]
  isbp_refs: [ISBP-A1, ISBP-A19]
  field_keys: [additional_conditions, documents_required]
  max_iterations: 6                 # ← 比 AGENT_TOOL 多
  execution_strategy: structured_output    # ← 当前唯一策略；预留 sub_agent
```

#### prompt 加成（`check-system-agentic.st`）

```
Iteration-budget policy (AGENTIC tier — multi-turn reasoning loop):
  - HARD turn budget. user prompt 会写明 N，超出 → NEEDS_REVIEW（比 DOUBTS 更糟）。
  - 每 turn 要么 emit tool_calls，要么 emit 终态 JSON，二者取一。
  - 单 turn 内并行批量发 tool calls，不要一 turn 一个。
  - 推荐节奏：1-2 turn 并行抓证据 → 余下推理 → 倒数第二 turn 必须收口。
```

#### 关键 prompt（`prompts/check/COND-47A.st`）—— 子结果契约

```
TASK：将 :47A: 拆为 atomic conditions（一个编号项一条）；逐条 PASS/FAIL/DOUBTS/NA + 引用 UCP/ISBP。

OUTPUT — single JSON object, no markdown fences

{
  "verdict": "PASS|FAIL|DOUBTS|NOT_APPLICABLE",
  "confidence": 0.0-1.0,
  "explanation": "<aggregated 1-2 sentence summary>",
  "condition_results": [
    {
      "condition_id": "47a-1",
      "condition_text": "<verbatim line(s) from :47A:>",
      "applies_to_docs": ["INV","BOL"],
      "check_kind": "PROG|AGENT|OUT_OF_SCOPE",
      "severity": "CRITICAL|MAJOR|MINOR",
      "verdict": "PASS|FAIL|DOUBTS|NOT_APPLICABLE",
      "confidence": 0.0-1.0,
      "explanation": "<one-sentence finding>",
      "ucp_refs": ["UCP-28"],
      "isbp_refs": ["ISBP-K10"]
    }
  ]
}

# condition_id 在一次 run 内稳定，officer override 用它做 target
```

#### user prompt 末尾自动注入的 tool hint

```
Tools available: getAllExtractedFields (★ bulk — prefer this), getLcField,
getDocField, getDocInventory, calculateDateDiff, listPresentedDocs.
Bias toward ONE bulk fetch over many small calls. Turn budget for this rule: 6.
```

#### 执行流（典型 2-3 turn 收口）

```
turn 1: assistant → tool_calls=[getAllExtractedFields(sessionId)]   ← 一次抓全
  ↓ result：{ lc:{…}, docs:{INV:{fields, off_schema:[…]}, BOL:{…}, …} }
turn 2: assistant → tool_calls=[calculateDateDiff(…)]               ← 顺手算个日期
  ↓ result
turn 3: assistant → 终态 JSON：
  {
    "verdict": "FAIL",
    "confidence": 0.92,
    "explanation": "5 conditions; 3 PASS, 1 FAIL (insurance amount), 1 OUT_OF_SCOPE",
    "condition_results": [
      {"condition_id":"47a-1","condition_text":"INVOICE NUMBER MUST APPEAR ON ALL DOCS","verdict":"PASS",...},
      {"condition_id":"47a-2","condition_text":"INSURANCE COVERAGE 110% INVOICE VALUE","verdict":"FAIL","severity":"MAJOR",...},
      {"condition_id":"47a-3","condition_text":"NEGOTIATION CHARGES FOR APPLICANT'S ACCOUNT","check_kind":"OUT_OF_SCOPE","verdict":"NOT_APPLICABLE",...},
      ...
    ]
  }
```

#### 服务端 verdict 改写（关键反 LLM 不一致逻辑）

模型经常顶层填 `DOUBTS` 但 sub 列里有明确 `FAIL`。`AgentRuleExecutor.parseResponse` 按 worst-of 强制重算：

```java
if (conditionResults != null && !conditionResults.isEmpty()) {
    Verdict aggregated = aggregateFromConditions(conditionResults);
    //  any FAIL  → FAIL
    //  else any DOUBTS/NEEDS_REVIEW → DOUBTS
    //  else any PASS → PASS
    //  else → NOT_APPLICABLE
    if (aggregated != verdict) {
        log.info("Rule {} verdict overridden: agent='{}' → aggregated='{}' from {} sub-results",
                 ruleId, verdict, aggregated, conditionResults.size());
        verdict = aggregated;
    }
}
return new CheckResult(ruleId, verdict, explanation, null, confidence,
                       "AGENTIC", toolCalls, conditionResults);
```

→ 顶层 verdict 永远等于 sub 的最差，**LLM 算错也救得回来**；这是评审里要重点感受的"防 LLM 幻觉"层。

### 5.7 落库形态（无论哪一档都长这样）

```sql
pipeline_steps(
  session_id, stage='examine', step_key='<rule_id>',
  status = verdict.name(),                 -- PASS / FAIL / DOUBTS / NEEDS_REVIEW / NOT_APPLICABLE / FAILED
  result_json = {
    check_type: "PROGRAMMATIC|AGENT|AGENT_TOOL|AGENTIC",
    explanation: "...",
    confidence: 0.0-1.0,
    duration_ms: <毫秒>,
    trigger_trace: [...],                  -- RuleTriggerEvaluator 的判定路径
    tool_calls: [                          -- 仅 AGENT_TOOL / AGENTIC 有，由 toolRegistry.beginCapture() 收
      { tool: "verifyArithmetic", args: {...}, result: {...} },
      ...
    ],
    condition_results: [                   -- AGENTIC 一定有；PROGRAMMATIC 在 helper 主动返时也有
      { condition_id, condition_text, verdict, confidence, explanation, ucp_refs, isbp_refs, ... },
      ...
    ]
  },
  duration_ms
)
```

视图 `v_check_results` 把这些字段平铺成 Controller / UI 直接可读形状（不暴露 JSONB）。

### 5.8 一行总结

| checkType | 一句话定位 |
|---|---|
| `PROGRAMMATIC` | "**纯逻辑**" —— 能用 SpEL + helper 写出来的，不调 LLM；最快、最便宜、可单测 |
| `AGENT` | "**让 LLM 看一眼**" —— 字段早 inline 在 prompt 里，单次 call，一段文字 + 一句 verdict |
| `AGENT_TOOL` | "**LLM + 算术 tool 一锤子**" —— 算术/日期不让模型心算；硬上限 3 turn |
| `AGENTIC` | "**LLM 自己拆任务 + 多轮拉证据**" —— 必返 condition_results；服务端 worst-of 兜底 |

加规则的标准动作：
1. 能 SpEL 的就 PROGRAMMATIC，**不要随手写 AGENT**（贵 + 慢 + 不稳）
2. 必须语义判断（"corresponds to" / "in English"）才上 AGENT
3. 涉及金额、日期算术 → AGENT_TOOL，让 `verifyArithmetic` 兜底
4. 需要把一条规则裂成多个子条款（:47A: 类）才用 AGENTIC，并务必让 LLM 返 `condition_results[]` 给服务端聚合

---

## 6. 评审清单：已知风险 / 实现缺口

按"**修复成本 vs. 业务影响**"排过一遍，按优先级给出。

### P0：业务正确性

1. **`reconLocked` 只在内存**（`StageContext.java:37`）：JVM 重启后 UI 看到 unlocked，但 DB `v_lock_state` 仍是 locked → 状态不一致。Rehydrate 时应从 `v_lock_state` 回填。
2. **金额容差 ±10% 错用范围**：`ReconcileNormaliser` 把 UCP 30(b) ±10% 应用到所有 AMOUNT 字段（draft_amount、invoice_total…）。规范上 30(b) 仅适用于 credit amount + bulk 商品。建议加 field-level tolerance 配置。
3. **视觉抽取无最低共识阈值**：所有 slot 都失败 → 返回 `DocumentExtract.empty()`，后续规则会大面积 NOT_APPLICABLE，但 UI 不会主动告警。建议 ≥1 slot 成功才算通过，否则把 doc 标 PARSE_FAILED。
4. **Officer 修正值无清洗**：`POST /fields/{key}/correction` 拿到的字符串原样落库 + 后续会进 LLM prompt → prompt injection 面。规则覆盖 reason 同样问题。

### P1：稳健性

5. **PdfBytesCache 无上限**（`infra/storage/PdfBytesCache.java`）：进程内 ConcurrentHashMap，OOM 风险。需要 LRU + size cap。
6. **SSE emitter 同步发送**：`PipelineEventChannel.publish()` 同步迭代所有 emitter，慢客户端会拖慢分发。@Async listener 只解耦了 stage，没解耦扇出。
7. **`clearDownstreamState` 无 `(session_id, stage)` 索引**：表大了走 seq scan。
8. **PDFBox page count 失败默认 1**（`IntakeStage.java:127-133`）：损坏 PDF 静默通过。
9. **JVM 重启后仅 Intake 不可 rerun**（Parse 已修复）：`PipelineService.rehydrateContext` 会遍历 `documents` 表，对每个非 LC 文档调 `s3Store.get(docId)` 把 PDF 字节回灌到 `ctx.uploadedDocBytes`；`canRehydrateForStage` 的 `parse` 分支放行（要求 `ctx.lc != null` + 每个非 LC doc 都拿回 bytes）。`reconcile/examine/signoff` 用 `v_lc_parse` + `v_doc_extracts_consensus` 即可重水合。**只有 `intake` 仍 `default → false`**（Intake 要重新分类 + 重置 docIds，逻辑上等同新 session）。残留风险：MinIO 不可达 / 对象被删时 Parse rerun 静默拿不到 bytes，但不会崩，只是回到 false。

### P2：UX / 可维护性

10. **Officer ID 硬编码 'A. Wijaya'**（`ui/src/lib/officer.js`）：所有 audit 都是同一个人 → 多用户场景假账。要从认证上下文取。
11. **DEV MODE 仅 localStorage**：会"被遗忘开着"；audit 中也没标记 DEV 走过。建议每 session 重置 + 在 audit 加 dev_mode 标识。
12. **PDF.js worker 走 unpkg CDN**（`PdfViewer.jsx:10`）：CDN 故障即 Parse 面板瘫痪。改为 bundle worker。
13. **没有 React error boundary**：单个面板抛错全 app 白屏。
14. **useSse 重连无退避无上限**：固定 2s，后端长时间不可用会无限重连。
15. **`useRules` 2s 轮询 + SSE 双源**：写竞争窗口存在；改为纯 SSE 增量 + 失败回退轮询会更干净。
16. **触发评估 trace 仅在内存**（`ExamineStage.java:54`）：rehydrate 后审计断片。应写入 `pipeline_steps(examine/meta)` 或独立 `phase:` step。
17. **AGENT 规则 tool 失败被吞**：tool 返回 "(absent)" 兜底，LLM 不知道是真没有还是查询失败 → verdict 可能错。建议把 tool 错误写进 explanation 必填字段。
18. **大文档（500+ 页）一次性渲染**：ParsePanel 没分页 lazy load。
19. **管理后台改规则不发布即生效**：没有 staging。多人协作时容易出事故。
20. **CORS / Auth 缺位**：现状是开发态裸跑；上生产前必须补。

---

## 7. 评审 / 上手时建议跑的"5 分钟自检"

```bash
# 后端编译 + 启动
make svc                                  # 看 logback 日志在 /tmp/lc-checker-v2/svc.log
curl http://localhost:9082/actuator/health
open http://localhost:9082/docs           # Scalar OpenAPI

# 前端
make ui
open http://localhost:5173

# 用 test/cases/01 跑通整条流水线
# 重点观察：
#   1) Intake 完成后 awaiting_officer=parse
#   2) ParsePanel ActivityStrip 滚动 4 个 sub-status
#   3) ReconcilePanel 出现 TOLERANCE 行（金额 ±10% 命中）
#   4) ExaminePanel worklist 出现 NOT_APPLICABLE 与 SKIP 数量差
#   5) Signoff JSON Export 内容齐全
```

跑通一遍 + 翻完上面的 P0-P2 清单，基本就是合格的二级评审深度。

---

## 8. 学习路径建议

- **第 1 天**：读本文 + 跑通 self-check + 读 `pipeline/PipelineService.java` 全文（最核心 300 行）
- **第 2 天**：读 `RuleTriggerEvaluator` + 一条 PROGRAMMATIC 规则（DATE-01）+ 一条 AGENT 规则（GOODS-01）的 prompt + SpEL helpers
- **第 3 天**：读 `VisionExtractService` 全文 + 自己跑一次缓存命中 / 未命中
- **第 4 天**：从前端 `useSse.js` 出发，找到一个 officer action 在 UI、网络、SSE、DB 视图中的完整生命周期
- **第 5 天**：从 P0 里挑 1 条修了发 PR，作为 onboarding 验收

> 任何"我想加一条规则" / "我想加一个文档类型" / "我想换一个 LLM 厂商"这三类需求都不应该改 Java 代码。如果你发现必须改，多半是踩到了前面 P 列表的一个缺口，先回来对一下。
