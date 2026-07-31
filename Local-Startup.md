# LC Checker v2 — Mac 本地启动

> **Agents**: [`AGENTS.md`](AGENTS.md) · Cursor rules: `.cursor/rules/`

全部通过 `make` 管理：**db**（Docker）+ **svc** / **ui**（本机）。

---

## 命令速查

### 按组件

| 组件 | 端口 | 启动 (up) | 停止 (down) | 模式 |
|------|------|-----------|-------------|------|
| **PostgreSQL** | 5432 | `make db` | `make db-down` | Docker 容器 |
| **svc**（后端） | 9090 | `make svc` | `make svc-down` | 本机 Gradle |
| **watch** | 9090 | `make watch` | `make svc-down` | 本机 Gradle + DevTools 热重启 |
| **ui**（前端） | 5174 | `make ui` | `make ui-down` | 本机 Vite |

### 组合

| 操作 | 命令 | 说明 |
|------|------|------|
| **全起** | `make up` | db → svc → ui（后台，日志 `/tmp/lc-checker-v2/`） |
| **停应用** | `make up-down` | 停 svc + ui，**db 保持运行** |
| **全停** | `make down` | 停 svc + ui + postgres |

### 诊断 / 工具

| 命令 | 作用 |
|------|------|
| `make help` | 列出所有目标 |
| `make status` | db / svc / ui 端口状态 |
| `make health` | svc `/actuator/health` |
| `make langfuse-auth` | 从 `.env` 密钥生成 `LANGFUSE_AUTH_BASIC` |
| `make db-reset` | 销毁并重建 Postgres 容器（库 `lc_checker`；svc 启动时创建 schema `lc_v3`） |

### 复制即用

```bash
# ── UP ──────────────────────────────────────────
make db              # 仅数据库
make svc             # 仅后端（前台，Ctrl-C 停）
make watch       # 后端 + 保存 Java 自动热重启（DevTools）
make ui              # 仅前端（前台，Ctrl-C 停）
make up             # 全部后台启动

# ── DOWN ────────────────────────────────────────
make svc-down        # 停后端
make ui-down         # 停前端
make up-down        # 停后端 + 前端（db 继续跑）
make db-down         # 停数据库
make db-reset       # 销毁并重建 lc_checker 库（schema lc_v3 由 svc 创建）
make down            # 全部停止

# ── CHECK ───────────────────────────────────────
make status
make health
```

---

## 首次启动

```bash
cd v3-e2e-flow
cp .env.example .env   # 填好密钥（见下）
make up
open http://127.0.0.1:5174
```

---

## 前置条件

JDK 21 · Node 20+ · Make · Colima（或 Docker Desktop）

`make db` 会在 Docker 未运行时自动尝试启动 Colima。

---

## `.env` 配置

与 `make db` 默认值对齐：

```dotenv
DB_HOST=localhost
DB_PORT=5432
DB_NAME=lc_checker
DB_USERNAME=lcuser
DB_PASSWORD=lcdev
STORAGE_MINIO_REQUIRED=false
LANGFUSE_ENABLED=false
```

| 变量 | 必填 | 用途 |
|------|------|------|
| `LLM_API_KEY` | yes | MiniMax 文本 LLM |
| `VISION_1_API_KEY` | yes | Bailian vision slot-1 |
| `VISION_2_API_KEY` | yes | Bailian vision slot-2 |
| `DB_NAME` | no | 数据库名，默认 `lc_checker`（与 v1/v2 共享库） |
| `STORAGE_MINIO_REQUIRED` | no | `false` = 不用 MinIO，PDF 仅存内存（Mac 本地默认） |
| `MINIO_*` | no | MinIO 密钥（仅 `STORAGE_MINIO_REQUIRED=true` 时需要） |
| `LANGFUSE_ENABLED` | no | `false` = 关闭 OTLP 导出（Mac 本地默认） |
| `LANGFUSE_*` | no | 仅 `LANGFUSE_ENABLED=true` 时需要（Ubuntu 生产） |

Schema 由 svc 启动时自动创建（`lc_checker` 库内的 **`lc_v3`** schema；v2 使用同库的 `lc_v2`），无需手动 SQL。

---

## 后端热重载（Spring DevTools）

项目已包含 `spring-boot-devtools`（`build.gradle.kts`）。`make svc` 启动后日志里出现
`Devtools property defaults active` 即已启用。

| 方式 | 命令 | 说明 |
|------|------|------|
| **推荐** | `make watch` | 后台 `classes --continuous` + `bootRun`；保存 `.java` 或 `src/main/resources/**` 后约 3s 自动重启 |
| IDE | `make svc` + IDE「保存时编译」 | IntelliJ / Cursor 开启 *Build project automatically* 效果相同 |
| 手动 | 改代码 → `cd lc-checker-v2-svc && ./gradlew classes` | DevTools 检测到 `build/classes` 变化后重启 |

### 各文件类型支持情况

DevTools 是 **Spring 上下文快重启**（约 3s），不是 JVM 热替换。保存后需触发 Gradle 编译/复制到 `build/classes`（`watch` 或 IDE 自动构建）。

| 文件 | 热重启后生效？ | 说明 |
|------|----------------|------|
| `src/main/java/**/*.java` | ✅ | 业务逻辑、Controller、Stage 等 |
| `src/main/resources/application.yml` | ✅ | 端口、模型名、vision slot、`STORAGE_MINIO_REQUIRED` 等（yml 内默认值；**不是** `.env`） |
| `src/main/resources/prompts/**/*.st` | ✅ | 系统/规则/vision 提示词；Bean 重建后重新加载 |
| `src/main/resources/rules/catalog.yml` | ✅ | 规则目录 |
| `src/main/resources/fields/*.yaml` | ✅ | 字段池、doc-type、tag mapping |
| `src/main/resources/refs/*.yaml` | ✅ | UCP/ISBP 条文 |
| `src/main/resources/logback-spring.xml` | ✅ | 日志配置 |
| `src/main/resources/db/schema.sql` | ⚠️ 每次重启重跑 | `spring.sql.init.mode=always`；DDL 为 idempotent，一般安全 |
| 项目根 `.env` | ❌ | `make svc` 启动时注入；改后需 `make svc-down && make svc` |
| `build.gradle.kts` / 新依赖 | ❌ | 需停进程 + `./gradlew bootRun` |
| `Makefile` | ❌ | 不影响已运行进程 |
| `test/cases/**`（preset bundles） | ❌ | `PresetService` 仅在启动时扫描；改后需重启 svc |
| PostgreSQL 数据 | — | 不受重启影响；内存中的 session 缓存会丢 |
| `ui/**` | — | 独立 Vite 进程，`make ui` 自带 HMR |

**副作用：** 重启会清空内存中的 `StageContext`、PDF hot cache、进行中的 SSE 连接；DB 已落库数据保留。

日志里线程名从 `main` 变为 `restartedMain` 表示 DevTools 快重启成功。

**仍需完整重启（`make svc-down && make svc`）的情况：**

- `.env` 变更（密钥、`STORAGE_MINIO_REQUIRED` 等）— 环境变量在进程启动时注入
- `build.gradle.kts` / 依赖变更
- 进行中的 session 会丢失内存缓存（`StageContext`、PDF hot cache）；DB 里已落库的数据仍在

`Unable to start LiveReload server` 可忽略——那是给静态资源用的，与 API 开发无关。

DevTools 热重启时若仍看到大段 `CONDITION EVALUATION DELTA`，已通过 `spring.devtools.restart.log-condition-evaluation-delta=false` 关闭（非错误，仅为自动配置 diff 报告）。

---

## 后台日志

`make up` 启动后：

| 服务 | 日志文件 |
|------|----------|
| svc | `/tmp/lc-checker-v2/svc.log` |
| ui | `/tmp/lc-checker-v2/ui.log` |

```bash
tail -f /tmp/lc-checker-v2/svc.log
```

---

## 故障排查

| 问题 | 处理 |
|------|------|
| svc 连不上 DB | `make db` → `make status`，核对 `.env` 密码 |
| `:9090` / `:5174` 被占用 | `make svc-down` / `make ui-down` |
| Docker 未运行 | `make db`（自动起 Colima） |
| Vision 失败 | 检查 `VISION_1/2_API_KEY` |
| MinIO 警告 | 本地设 `STORAGE_MINIO_REQUIRED=false` 并重启 svc，应见 `MinIO not required` |
| Langfuse `HttpExporter` timeout | `.env` 设 `LANGFUSE_ENABLED=false` 并重启 svc |
| Intake「classifying」很慢 | 确认 `.env` 中 `STORAGE_MINIO_REQUIRED=false`；未设置时会尝试连 Ubuntu MinIO 并每次 PDF 超时 ~8s |
| Presets 500 / 加载失败 | 先 `make health`；svc 未就绪时 Vite 代理会 500。`make up` 会等 svc UP 后再起 ui。日志应见 `[Presets] loaded N bundles` |

---

## 相关文件

| 文件 | 作用 |
|------|------|
| `Makefile` | 所有 up / down 目标 |
| `.env.example` | 密钥模板 |
| `application.yml` | 业务配置（端口、模型等） |

> Ubuntu 生产部署见 `infra/docker-compose.yml`（Mac 本地不要用 `make dep-*`）。
