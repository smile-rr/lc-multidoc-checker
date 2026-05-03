```text
╔══════════════════════════════════════════════════════════════════════════╗
║                    LC CHECKER V2 · COMPLETE SYSTEM FLOW                 ║
╚══════════════════════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 PHASE 0 · UPLOAD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ┌──────────────────────────────────────────────────────────────────┐
  │  MT700 (plain text)                                              │
  │  Documents (PDF)                                                 │
  │    Invoice / Bill of Lading / Packing List /                     │
  │    Bill of Exchange / Beneficiary Certificate / Warranty Cert    │
  └──────────────────────────────┬───────────────────────────────────┘
                                 │  format validation, size check
                                 │  file type check
                                 │  fail → reject before processing
                                 │
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 PHASE 1 · PARSE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                       ┌──────────┴──────────┐
               MT700 Parser             VLM Extractor
             Regex / Prowide             Qwen3-VL
             → LC Fields JSON           → Doc Fields JSON
                       └──────────┬──────────┘
                                  │
                       ┌──────────▼──────────┐
                       │  Layer 1             │  Code
                       │  Completeness Check  │  必填字段 / 格式校验
                       └──────────┬───────────┘
                              pass│  fail
                                  │    └─────────────→  REJECTED ✗
                                  │                     早失败早拒绝
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 PHASE 2 · RECON
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                       ┌──────────┴──────────┐
                Layer 2                  Layer 3
                Doc vs LC                Cross-doc
                精确字段比对              文档间交叉比对
                金额/币种/日期/港口        qty: B/L = P/L = Invoice
                Code                     Code
                       └──────────┬──────────┘
                                  │
                       ┌──────────▼──────────┐
                       │    ReconReport       │
                       │    field-level        │
                       │    match / mismatch   │
                       └──────────┬───────────┘
                                  │
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 PHASE 3 · EXAMINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                                  │
              ┌───────────────────┴──────────────────┐
              │                                      │
   ┌──────────▼───────────┐             ┌────────────▼────────────┐
   │  Code Rule Selector  │             │   AdHoc Extractor        │
   │                      │             │                          │
   │  遍历 Rule Catalog    │             │   读 46A / 47A 原文      │
   │  eval trigger        │             │   CoT 推理链：           │
   │  Condition           │             │   理解条款意图            │
   │  确定性激活，零遗漏   │             │   → 提取可验证条件        │
   │                      │             │   LLM 预训练知识          │
   │  ↕                   │             │   （无需 RAG）            │
   │  Rule Catalog        │             │                          │
   │  ┌────────────────┐  │             │   输出条件分类：          │
   │  │ rule_id        │  │             │   AUTO → 可程序验证       │
   │  │ triggerCond    │  │             │   HUMAN → 无法自动验证    │
   │  │ promptInstr    │◄─┤             │          直接进 HumanQ   │
   │  │   (审单员维护) │  │             └────────────┬────────────┘
   │  │ ucpReference   │  │                          │ AUTO 条件
   │  │ ucpText(审计)  │  │                          │ 加入本次
   │  └────────────────┘  │                          │ CheckPlan
   └──────────┬───────────┘                          │
              │  CheckPlan                            │
              └──────────────────┬────────────────────┘
                                 │
                      ┌──────────▼──────────┐
                      │    Rule Executor     │
                      │                     │
                      │  TYPE A  Code        │
                      │  金额/日期/数量       │──→ DISCREPANCY (直接输出)
                      │  精确比对             │
                      ├─────────────────────┤
                      │  TYPE B  LLM         │
                      │  prompt 模板注入：    │
                      │  · promptInstruction │◄── Rule Catalog
                      │    (操作化解读)       │    按 rule_id 查询
                      │  · 相关字段值         │    直接注入，非 RAG
                      │  单次 LLM call        │
                      │  语义判断             │
                      ├─────────────────────┤
                      │  TYPE C  LLM + RAG   │
                      │  无明确条文的边缘案例  │
                      │                     │
                      │  prompt 注入：        │
                      │  · promptInstruction │◄── Rule Catalog
                      │  · few-shot 案例      │◄── Case KB (RAG)
                      │    top 3-5 相似先例   │    元数据过滤
                      │  建议+引用先例        │    向量检索
                      │  强制 REQUIRES_REVIEW │    Cross-encoder 重排
                      └──────────┬───────────┘
                                 │
                      ┌──────────▼──────────┐
                      │    Aggregator        │
                      │    confidence 分流    │
                      │                     │
                      │  ≥ 0.85 → Auto       │
                      │  < 0.85 → Human Q    │
                      │  Type C  → Human Q   │  Type C 强制人审
                      └──────────┬───────────┘
                                 │
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 PHASE 4 · REVIEW  (简化)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                      ┌──────────┴──────────┐
                   Auto                 Human Queue
                   Results              审单员独立判断
                      │                 只看证据+解读
                 Review Mode            不看 AI 结论
                 Mode 1: 全量 confirm        │
                 Mode 2: X% 抽查             │
                 (合规批准后)                │
                      └──────────┬──────────┘
                                 │
                      ┌──────────▼──────────┐
                      │  Examiner Sign-off   │
                      │  工号 + 时间戳        │  法律责任锚点
                      └──────────┬───────────┘
                          ┌──────┴───────┐
                     Discrepancy       Audit Log
                     Report            AI输出+人工决定
                                       ucpText 原文
                                       留存 7 年
                                 │
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 PHASE 5 · KNOWLEDGE BASE MAINTENANCE  (简化)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  触发入库条件（满足任一）：
  ① 本次判定来自 Type C
  ② 审单员推翻 AI 建议
  ③ 审单员主动标记"疑难案例"

                      ┌──────────▼──────────┐
                      │   Case Capture       │
                      │   系统预填：          │
                      │   文档类型/字段/结论  │
                      │   审单员补填：        │
                      │   核心理由（必填）    │
                      └──────────┬───────────┘
                      ┌──────────┴──────────┐
                      │                     │
               Case Quality            Anomaly Table
               Grading                 AI 被推翻
               GOLD   ★★★             审单员存疑
               高级审核员复核           定期分析盲点
               SILVER ★★              300+ 条后
               置信度"确定"            → 微调数据集
               BRONZE ★
               降权检索
                      │
                      ▼
         ┌────────────────────────────┐
         │      Case KB (ChromaDB)    │
         │                            │
         │  source=ICC_OPINION        │
         │  ICC 官方裁决 / DOCDEX     │  ← 公开案例预导入
         │                            │
         │  source=INTERNAL_CASE      │
         │  银行审核员历史判定         │  ← 审核后持续入库
         │                            │
         │  统一 collection           │
         │  source 字段区分            │
         │  GOLD 优先检索              │
         └────────────────────────────┘
                      ▲
                      │ Type C 执行时
                      │ 元数据过滤 → 向量检索
                      │ → Cross-encoder 重排
                      │ → top 3-5 注入 few-shot
                      │
              回到 PHASE 3 Type C Executor

══════════════════════════════════════════════════════════════════════════
 知识层总览
══════════════════════════════════════════════════════════════════════════

  静态规则知识（不做 RAG）
  ├── Rule Catalog (YAML)
  │     rule_id / triggerCondition / promptInstruction / ucpReference
  ├── UCP 600 全文  → ucpText 字段，审计引用
  └── ISBP 821 全文 → ucpText 字段，审计引用
      按 rule_id 索引，直接注入 prompt

  动态案例知识（Type C 专用 RAG）
  ├── ICC_OPINION   ICC 官方裁决 / DOCDEX 公开案例
  └── INTERNAL_CASE 银行审核员历史判定
      ChromaDB，source 字段区分，GOLD 优先

  异常记录（独立分析，不做 RAG）
  └── Anomaly Table
      AI 被推翻 / 审核员存疑 / 上升高级审核
      → 定期分析系统盲点 → 足量后进微调

══════════════════════════════════════════════════════════════════════════
 核心设计决策
══════════════════════════════════════════════════════════════════════════

  Phase 0   文件校验前置，格式错误在进系统前拒绝
  Phase 1   Layer 1 前移到 Parse，早失败
  Phase 2   Layer 2/3 纯 Code，不碰 LLM
  Phase 3   Rule Selector 零遗漏 + AdHoc CoT 补自定义条款
            Type A/B 无 RAG，prompt 模板注入操作化解读
            Type C 才用 RAG，few-shot 案例先例
            promptInstruction 由审单员维护，不是开发
  Phase 4   Examiner 签字是法律锚点，AI 永远是工具
  Phase 5   Case KB 持续增长，GOLD/SILVER/BRONZE 分级检索
            Anomaly Table 独立维护，足量后转微调数据集
```