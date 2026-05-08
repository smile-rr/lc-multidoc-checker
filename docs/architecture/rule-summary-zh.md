# v2 规则覆盖与测试指南（中文摘要）

**适用范围：** 议付/通知行收到提交单据后，对照 LC 进行单据审核（UCP 14(a) examination on presentation）。
**不适用范围：** LC 本身的合规性审查（属于开证行在出证时的责任，不在 v2 范围）。
**支持的单据类型：** INV（商业发票）· BOL（提单）· PKL（装箱单）· BOE（汇票）· BC（受益人证书）· WC（保函证书）

---

## 1. 规则总览

**18 条静态规则 + 1 个 :47A: 动态生成器**。规则按"合规关注点"分类，不按单据类型分。同一概念的检查整合到一条规则内（如所有日期检查不再按单据拆分），程式化（PROG）与 LLM（AGENT/AGENT_TOOL）按基础设施需求选用。

| 概念分组 | 规则编号 | 数量 |
|---|---|---|
| 日期合规（DATE） | DATE-01 / DATE-02 / DATE-03 | 3 |
| 金额与币种（AMT） | AMT-01 / AMT-02 | 2 |
| 单据齐套（DOCSET） | DOCSET-01 / DOCSET-02 | 2 |
| 货物描述（GOODS） | GOODS-01 | 1 |
| 运输单据（TRANS） | TRANS-01 / TRANS-02 / TRANS-03 / TRANS-04 | 4 |
| 当事方（PARTY） | PARTY-01 / PARTY-02 | 2 |
| 跨单一致性（XD） | XD-01 / XD-02 | 2 |
| 证书（CERT） | CERT-01 / CERT-02 | 2 |
| **小计（静态）** | | **18** |
| :47A: 动态生成 | COND-DYN | 1（组件） |

**类型分布：** PROG × 6 ｜ AGENT × 10 ｜ AGENT_TOOL × 2 ｜ AGENTIC × 1（仅 COND-DYN）

---

## 2. 每条规则简要说明

### 日期类（DATE）

| 规则 | 中文说明 | 触发条件 | 严重性 |
|---|---|---|---|
| **DATE-01** | 任何提交单据的日期都不得晚于交单日期，非运输单据通常不早于 LC 开证日期（UCP 14(c)/(i)） | 任一单据存在 | MAJOR |
| **DATE-02** | 交单日在 21 天发运窗口内（或 LC `:48:` 规定的天数），且不晚于 LC `:31D:` 失效日（UCP 14(c)） | 必须有 BOL | CRITICAL |
| **DATE-03** | 装船日不晚于 LC `:44C:` 最迟装船日 | 必须有 BOL；LC 须有 `:44C:` | CRITICAL |

### 金额类（AMT）

| 规则 | 中文说明 | 触发条件 | 严重性 |
|---|---|---|---|
| **AMT-01** | 发票币种 = LC `:32B:` 币种；发票金额在 LC `:39A:` 容差内（默认 UCP 30(b) ±5%）；发票各行小计相加等于总额 | 必须有 INV；LC 须有 `:32B:` | CRITICAL |
| **AMT-02** | 汇票金额 = 发票总额（UCP 18(a)） | 必须同时有 BOE + INV | CRITICAL |

### 单据齐套类（DOCSET）

| 规则 | 中文说明 | 触发条件 | 严重性 |
|---|---|---|---|
| **DOCSET-01** | LC `:46A:` 规定的每份单据都已提交；按 UCP 14(f) 接受名称等价（如 "Form A" ≡ 原产地证书）。**这是"缺单据"问题的唯一报错出口**——其他规则在缺所需输入时只记 `NOT_APPLICABLE`，不重复报错。 | LC 须有 `:46A:` | CRITICAL |
| **DOCSET-02** | BOL 全套正本提交（如标 "3/3 ORIGINALS"，则 3 份全部到位） | 必须有 BOL | CRITICAL |

### 货物描述类（GOODS）

| 规则 | 中文说明 | 触发条件 | 严重性 |
|---|---|---|---|
| **GOODS-01** | 发票货描"对应于"LC `:45A:`（UCP 18(c) / ISBP C3）；可加细节但不得矛盾；ISBP A19 容许排印小差异。**仅检查发票**——PKL/BOL 的货描走 XD-02。 | 必须有 INV；LC 须有 `:45A:` | MAJOR |

### 运输单据类（TRANS，仅 BOL）

| 规则 | 中文说明 | 触发条件 | 严重性 |
|---|---|---|---|
| **TRANS-01** | BOL 带有装船注记和日期。"received for shipment" 形式必须有独立的装船注记；"shipped on board" 形式以签发日期作为装船日（UCP 20(a)(ii)） | 必须有 BOL | CRITICAL |
| **TRANS-02** | BOL 是清洁的（无残损批注）。ISBP D25 的"shipper's load and count"等不算不清洁。重点扫 `off_schema_items`（手盖戳记常在此） | 必须有 BOL | MAJOR |
| **TRANS-03** | BOL 装港/卸港 = LC `:44E:` / `:44F:`，含"ANY CHINESE PORT"等通用约定的解析（UCP 20(a)(iii)） | 必须有 BOL；LC 须有 `:44E:` 或 `:44F:` | CRITICAL |
| **TRANS-04** | 发票 Incoterm 与 BOL 运费标识一致：CIF/CFR/CIP/CPT → freight prepaid；FOB/FCA → freight collect。UCP 26 禁止未经 LC 允许的 ON DECK 装载 | 必须同时有 BOL + INV | MAJOR |

### 当事方类（PARTY）

| 规则 | 中文说明 | 触发条件 | 严重性 |
|---|---|---|---|
| **PARTY-01** | 受益人/申请人在所有提交单据中标识一致；ISBP A19/A20 容许地址细节差异，但不能是不同法人 | 任一带当事方信息的单据；LC 须有 `:50:` 和 `:59:` | MAJOR |
| **PARTY-02** | 汇票付款人 = LC `:42A:` / `:42C:` / `:42D:` 指定的银行；优先比 BIC，再比名称、地址 | 必须有 BOE；LC 须有 `:42A:`/`:42C:`/`:42D:` | CRITICAL |

### 跨单一致性类（XD）

| 规则 | 中文说明 | 触发条件 | 严重性 |
|---|---|---|---|
| **XD-01** | 数量、毛重/净重、唛头在 INV / PKL / BOL 之间一致；含单位归一化（kg ↔ MT） | INV/PKL/BOL 中至少存在 2 份 | MAJOR |
| **XD-02** | PKL/BOL 货描"不与"INV/LC 矛盾（UCP 14(e) 允许更宽泛但不得相左）。区别于 GOODS-01 的"对应于" | 必须有 INV，且 PKL/BOL 至少存在一份；LC 须有 `:45A:` | MAJOR |

### 证书类（CERT，BC + WC 通用）

| 规则 | 中文说明 | 触发条件 | 严重性 |
|---|---|---|---|
| **CERT-01** | BC/WC 内容满足 LC `:46A:` / `:47A:` 中要求出具该证书的条款（如"声明货物符合 EU 2023/45"） | BC 或 WC 存在；LC 须有 `:46A:` 或 `:47A:` | MAJOR |
| **CERT-02** | LC 要求签字时，证书带签字（ISBP A12：手写、印鉴、加密电子签均可；ISBP Q3：仅公司盖章不算签字）；如指定签字方，则签字方匹配 | BC 或 WC 存在 | MAJOR |

### :47A: 动态生成（COND-DYN，AGENTIC）

非静态规则，是流水线组件。在 Examine 阶段把 LC `:47A:` 自由文本拆解成 N 个原子条件，每条带：
- `source_text`（逐字引用 :47A: 原文）
- `applies_to_docs`（目标单据集合）
- `polarity`（POS/NEG）· `severity`（CRITICAL/MAJOR/MINOR）
- `check_kind`（ASSERT_PRESENT / ASSERT_EQUALS / ASSERT_FORMAT / ASSERT_ABSENT / OUT_OF_SCOPE）
- `check_prompt`（下游 AGENT 的执行指令）

每条非 `OUT_OF_SCOPE` 的动态条件以 `DYN-<id>` 合成规则形式由 AgentRuleExecutor 执行；结果以 `step_key='dyn:<id>'` 持久化。同一 LC :47A: 文本下次运行可命中缓存，不重复 LLM 调用。

---

## 3. NOT_APPLICABLE 级联机制（重要）

按 UCP 14(a)，议付行只审议交单的单据。本系统遵循三档"缺数据"语义：

| 情况 | 处理 |
|---|---|
| LC 要求某份单据但未提交 | **DOCSET-01 报 FAIL**（且仅 DOCSET-01 报告此 discrepancy） |
| 某规则需要某单据作输入但该单据未提交 | 该规则记 `NOT_APPLICABLE`，原因写明"input doc X not presented (see DOCSET-01)" |
| 某规则需要某 LC 字段（如 `:44C:`）但该字段为空 | 该规则记 `NOT_APPLICABLE`，原因写明"LC field X not populated" |

**绝不静默跳过**——每条规则都有可追溯的结果。**绝不重复报告缺单据**——只 DOCSET-01 一处。

---

## 4. 测试需准备的单据

### 4.1 标准测试单据（每个测试用例 7 份）

| 文件名 | 说明 |
|---|---|
| `mt700.txt` | LC 全文（SWIFT 格式），覆盖 `:31C:` `:31D:` `:32B:` `:39A:` `:44C:` `:44E:` `:44F:` `:45A:` `:46A:` `:47A:` `:50:` `:59:` 等 |
| `invoice.pdf` | 商业发票 |
| `bill-of-lading.pdf` | 海运提单 |
| `packing-list.pdf` | 装箱单 |
| `bill-of-exchange.pdf` | 汇票 |
| `beneficiary-cert.pdf` | 受益人证书 |
| `warranty-cert.pdf` | 保函证书 |

文件名按关键字识别单据类型，详见 `v2-multiple-doctype/CLAUDE.md` 的 *Doc Type Detection*。

### 4.2 已有 4 个测试用例（`test/cases/`）

| 用例 | 商品 | 主要特征 |
|---|---|---|
| `01-widgets-singapore` | 工业组件 | USD 60,000 / FOB 巴生港-新加坡 / 简单条款 |
| `02-apparel-acme` | 服装 | USD 50,000 / 美国-德国 / 美国原产 |
| `03-painting-artfinder` | 单件画作 | GBP 100 / 个人卖家 / 极小金额 |
| `04-boots-baton-rouge` | 靴子 | USD 490 / 极小金额 / `:46A:` 仅要求 INV+PKL（无证书条款） |

### 4.3 推荐补充用例（覆盖盲区）

| 场景 | 目的 |
|---|---|
| 缺单（删除 BOL）的 01 用例 | 验证 NOT_APPLICABLE 级联：DOCSET-01 报 FAIL，TRANS-01..04 等记 NOT_APPLICABLE |
| 故意拼错 buyer 名（替换 INV PDF）的 01 用例 | 验证 PARTY-01 容忍 ISBP A19 排印差异 vs 报错不同法人 |
| `:32B:` 改为 `EUR60000,00` 但 INV 仍是 USD | 验证 AMT-01 报币种不一致 |
| `:44C:` 改为早于实际装船日 | 验证 DATE-03 报装船过迟 |
| `:47A:` 加入复杂多条款（"INVOICE TO QUOTE PO + BC TO BEAR APOSTILLE + NO TRANSHIPMENT"） | 验证 COND-DYN 拆分出多条动态条件并分别派发 |
| 删除 BC + WC 的 04 用例 | 验证 CERT-01/02 记 NOT_APPLICABLE |

---

## 5. 测试流程

### 5.1 启动

```bash
cd v2-multiple-doctype
make svc        # Spring Boot 后端 :9082（前台运行；阻塞）
make ui         # Vite 前端 :5173（另开终端）
# 或：make all  # 后台并行启动
```

确认：`http://localhost:9082/actuator/health` → UP；`http://localhost:5173` 打开 v2 UI。

### 5.2 单个用例验证步骤

1. **上传**：把 1 份 `mt700.txt` + 6 份 PDF 一起拖入主页投递区，提交。
2. **Intake** 阶段：确认 6 个单据类型识别正确；右侧 Required-doc checklist 显示 LC `:46A:` 解析项。
3. **Parse** 阶段：每份单据展开后，每个字段都应显示 `raw_quote`（原文引用）；点击 "off-schema items" 应有非空列表。
4. **Reconcile** 阶段：跨单字段比对结果浏览。
5. **Examine** 阶段：18 条规则执行结果按规则号排列。对照 `verification-corpus.md` 表格逐条核对实际 vs 预期。
6. **COND-DYN**：找带 `DYN-` 前缀的动态条目；条数应与该用例 `:47A:` 子句数大致匹配（用例 01 = 3 条，用例 04 = 1 条）。
7. **Sign-off** 阶段：合规结论 + 签发记录。

### 5.3 验证清单（每用例必查）

- [ ] 18 条静态规则全部执行（FIRE 或 NOT_APPLICABLE，不应出现"未执行"）
- [ ] `DOCSET-01` 与 `verification-corpus.md` 表格一致
- [ ] 缺单情况下：`DOCSET-01` 报 FAIL，依赖该单据的规则均为 NOT_APPLICABLE 并指向 "see DOCSET-01"
- [ ] 任一 AGENT 规则的 LLM 输入日志（`/tmp/lc-checker-v2/svc.log` 或 Langfuse）显示 UCP/ISBP 文本已注入（`{{ref.X.text}}` 已被替换）
- [ ] COND-DYN 动态条件持久化到 `pipeline_steps`（`step_key=dyn:*`）
- [ ] 同一用例第二次运行时，COND-DYN 命中缓存（日志 "COND-DYN cache hit"）
- [ ] 任一字段的 `raw_quote` 与 PDF 原文匹配
- [ ] BOL 的 `off_schema_items` 至少含 1 条（承运人条款 / 运费戳等）

### 5.4 失败处置流程

| 现象 | 大概原因 | 排查方向 |
|---|---|---|
| 字段值正确但 `raw_quote` 为空 | 抽取 prompt 未输出 `raw_quotes` 子对象 | 检查 `prompts/extract/<doc>-extract-vision.st` |
| LLM 输入里仍有字面 `{{ref.X.text}}` | citation 解析未走 `ArticleRefRegistry.resolve()` | 检查 `AgentRuleExecutor.userPromptFor` 是否调用 `refs.resolve` |
| 规则未启动报 "Unknown article ref id" | 引用了 corpus 不存在的 id | 编辑 `refs/ucp600.yaml` 或 `refs/isbp821.yaml` 补条目 |
| 缺单时依赖规则报 FAIL 而非 NOT_APPLICABLE | `flipSystemNa` 未删干净，或 `emitNa` 仍写 FAIL | 检查 `ExamineStage.emitNa` 与 `runRule` |
| COND-DYN 未生成任何条件 | LC `:47A:` 为空，或 LLM 返回非 JSON | 看 `/tmp/lc-checker-v2/svc.log` 中的 COND-DYN 日志段 |

---

## 6. 当前覆盖率（对照 80 分位真实拒付原因）

| 拒付原因 | 占比（粗估） | v2 覆盖 |
|---|---|---|
| 交单超期 / 过期 | 12% | DATE-02 ✓ |
| 货描不一致 | 14% | GOODS-01 ✓ |
| 单据互相不一致（量、唛、描述） | 17% | XD-01 / XD-02 ✓ |
| 缺单 / 单据形式不符 | 10% | DOCSET-01 ✓ |
| 装船过迟 | 8% | DATE-03 ✓ |
| 保险单瑕疵 | 6% | 不在范围（INS 非 v2 单据） |
| BOL 瑕疵（清洁/装船/全套/港口/运费） | 12% | TRANS-01..04 + DOCSET-02 ✓ |
| `:47A:` 自定义条款瑕疵 | 10% | COND-DYN ✓ |
| 量与装箱单不一致 | 5% | XD-01 ✓ |
| 其他 | 6% | 部分覆盖 |

**范围内覆盖率 ≈ 94%**（不含保险单）。

---

## 7. 范围外（明确不做）

- LC 自身合规性审查（UCP 6/30/38 等）—— 属于开证行职责
- 保险单（INS）、原产地证书（COO）、商检证明 —— v3 范围
- 非海运运输（航空运单 AWB / 公路运输 CMR / 铁路 RWB）—— v3 范围
- 多语言单据翻译 —— 单语言约束
- 在 Examine 路径上使用 RAG —— 经评估不适用，UCP/ISBP 通过规则绑定方式注入

---

## 8. 配套文档

| 文档 | 内容 |
|---|---|
| `production-readiness.md` | 架构总纲：流水线设计、citation 单源、:47A: 处理、覆盖率门槛 |
| `rule-set.md` | 18 条规则的英文 SoT（含 evidence shape、POS/NEG 测试场景） |
| `spike-plan.md` | 7 工作流的代码级落地计划（W1-W7） |
| `verification-corpus.md` | 4 个测试用例 × 18 规则的预期 verdict 矩阵 |
| `rule-summary-zh.md`（本文件） | 中文摘要、测试指引 |
