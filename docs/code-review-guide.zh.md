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

## 2. 主流程：从上传到 Signoff，逐步是什么发生了

### 2.0 创建 session
- UI：`HomePage.jsx` → `api.createSession(lcText, files)` POST `/api/v2/sessions`（FormData）
- SVC：`SessionController` 接收 → `PipelineService.createSession()`（`pipeline/PipelineService.java:25-377`）→ 落 `check_sessions` 行 → 异步触发 Intake
- SSE：UI 立即 `openStream(id)` 订阅 `/api/v2/sessions/{id}/stream`，后端 `PipelineEventChannel` 会从 ring buffer 回放历史事件

### 2.1 Stage 0 Intake（`stage/intake/IntakeStage.java:21-159`）
- 文件名关键词分类（`bol`、`invoice`、`mt700` 等），UNKNOWN 不阻断只告警
- PDF 用 PDFBox 读 page count（失败默认 1，**有静默风险**）
- 字节同时进 `S3FileStore`（MinIO）和 `PdfBytesCache`（进程内 Map，用于 Parse 阶段直接读）
- MT700 走 `Mt700Parser`（Prowide Core）→ 写入 `pipeline_steps(intake/lc_parse)` 一行 JSON
- 完成后 `markAwaitingOfficer(intake, parse)` → SSE 发 `AwaitingOfficer{stage=parse}` → UI Intake 面板亮 Continue

### 2.2 Stage 1 Parse（`stage/parse/`）
两条独立子流程：
- **MT700 解析**：`Mt700Parser.java` 用 `lc-tag-mapping.yaml` 把 SWIFT tag → canonical field key；`DocumentListParser` 解 `:46A:`，`IncotermsExtractor` 派生 Incoterm 类
- **视觉抽取**：`VisionExtractService.java`
  - 4 个 slot 并发；每 slot = 一个独立模型（VISION_N_*）
  - 缓存 key：SHA256(pdf bytes + prompt + model + base-url + render-dpi + max-pages + max-long-edge-px + version)
  - **Qwen 家族特判**（`isQwenFamily(model)`）：请求体顶层注入 `enable_thinking:false` + `response_format:{type:"json_object"}`；其它厂商（MiniMax/GLM/Kimi）会因这俩字段 400，所以必须跳过
  - 共识：majority vote，平票 slot-1 胜；置信度 HIGH/MED/LOW 由一致程度推
  - 进度事件 `ExtractionProgress`：`rendering_pdf → rendered_N_pages → calling_<model> → parsing_response → complete`，UI ActivityStrip 实时贴
- 单 doc 结束写 `pipeline_steps(parse/extract:<doc>:<slot>)` 多行 + `consensus:<doc>` 一行；视图 `v_doc_extracts_consensus` 做投影

### 2.3 Stage 2 Reconcile（`stage/reconcile/`）
**关键边界**：Reconcile 是**纯机械、不调 LLM**。

- `ReconcileNormaliser.java` 做归一化：whitespace/case/Unicode NFD、币种符号 ↔ ISO、9 种日期格式、单位同义词组（kg/kilo/kilogram…）
- 金额走 UCP 30(b) ±10% 容差 → `TOLERANCE` verdict
- 输出每个 canonical 字段一行 `ReconField`，verdict ∈ `MATCH / DISCREPANCY / TOLERANCE / MISSING / NA`
- UI 端：每个非 MATCH 非 NA 单元格都必须 officer 决定（`parse_error / genuine / accept_match / edited`）才能 Lock；Lock 完才能进 Examine

### 2.4 Stage 3 Examine（`stage/examine/`）
**主控**：`ExamineStage.java` 加载 catalog → `RuleTriggerEvaluator` 决定每条规则 `FIRE / NOT_APPLICABLE / SKIP` → 按 tier 排序（PROGRAMMATIC → AGENT → AGENT_TOOL → AGENTIC）→ 顺序执行。

- **Trigger 语义**（重要审计点）：
  - `triggerDocs` 缺文档 → SKIP（**静默**，不出现在 worklist）
  - `lcFieldsRequired` 缺字段 → NOT_APPLICABLE（**可见**，写入结果）
  - 这是 W5 契约："missing required doc 是 DOCSET-01 的独占职责"
- **PROGRAMMATIC**：`SpelEvaluator` 在 SpEL 上下文 `#lc`、`#docs[DOC_TYPE]`、`#presentationDate` 上跑表达式；常用 `T(MultiDocHelpers).docDatesValid(...)`
- **AGENT / AGENT_TOOL / AGENTIC**：`AgentRuleExecutor`
  - 用 Spring AI `ChatClient`，system prompt 由 `check-system-base.st` + tier 加成（`-tools` / `-agentic`）拼接
  - 每条规则一份 `prompts/check/<RULE_ID>.st`，里面用 `{{ref.UCP-14-c.text}}` 这种 token 注入条文（`ArticleRefRegistry` 从 `refs/ucp600.yaml` / `isbp821.yaml` 解析）
  - **Tool 注册**走 `ExamineToolRegistry`：`getLcField`、`getDocField`、`calculateDateDiff`、`verifyArithmetic`；AGENT_TOOL 只露算术 tool，AGENT_TOOL/AGENTIC 才露数据 tool
  - 每条规则有硬迭代上限 `Rule.maxIterations` 或 `app.llm.max-iterations`（默认 3）
  - 用 `Observation.createNotStarted("rule." + ruleId)` 让 `gen_ai.client.operation` span 嵌到规则 span 下
- 结束写 `pipeline_steps(examine/<rule_id>)` 一行 / 规则；视图 `v_check_results`

### 2.5 Stage 4 Signoff（`stage/signoff/`）
- 聚合 verdict → `compliant = no FAIL or DOUBTS`
- `Mt734Generator` 生成 SWIFT MT734 文本（拒付时用）
- 写 `pipeline_steps(signoff/report)` 一行；session 标 `COMPLETED + signed`，从 `contextCache` 移除（之后再 rerun 必须重 rehydrate）

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

## 5. 评审清单：已知风险 / 实现缺口

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
9. **JVM 重启后 Intake/Parse 不可 rerun**：因为 `PdfBytesCache` 不持久化；文档承认了，但没有自动从 MinIO 重水合的代码。

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

## 6. 评审 / 上手时建议跑的"5 分钟自检"

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

## 7. 学习路径建议

- **第 1 天**：读本文 + 跑通 self-check + 读 `pipeline/PipelineService.java` 全文（最核心 300 行）
- **第 2 天**：读 `RuleTriggerEvaluator` + 一条 PROGRAMMATIC 规则（DATE-01）+ 一条 AGENT 规则（GOODS-01）的 prompt + SpEL helpers
- **第 3 天**：读 `VisionExtractService` 全文 + 自己跑一次缓存命中 / 未命中
- **第 4 天**：从前端 `useSse.js` 出发，找到一个 officer action 在 UI、网络、SSE、DB 视图中的完整生命周期
- **第 5 天**：从 P0 里挑 1 条修了发 PR，作为 onboarding 验收

> 任何"我想加一条规则" / "我想加一个文档类型" / "我想换一个 LLM 厂商"这三类需求都不应该改 Java 代码。如果你发现必须改，多半是踩到了前面 P 列表的一个缺口，先回来对一下。
