# lc-checker-v2 — Makefile
#
# Mac local dev (all via make):
#   make db                    Postgres in Docker (Colima) on :5432
#   make svc                   Spring Boot on :9082 (foreground)
#   make ui                    Vite dev server on :5173 (foreground)
#   make helix                 TB Helix AI UI on :5174 (foreground)
#   make all                   db + svc + ui in background
#
# Stop:
#   make db-down               stop Postgres container
#   make svc-down              kill :9082
#   make ui-down               kill :5173
#   make helix-down            kill :5174
#   make all-down              stop svc + ui + helix (keeps db running)
#   make down                  stop everything (svc + ui + db)
#
# Docker production (Ubuntu only — infra/docker-compose.yml):
#   make dep-svc / dep-ui / dep-all
#
# Utilities:
#   make status / make health / make langfuse-auth
#
# +------------------+-------------------+------------------+-------+-----------------------------+
# | Component        | Up                | Down             | Port  | URL                         |
# +------------------+-------------------+------------------+-------+-----------------------------+
# | db               | make db           | make db-down     |  5432 | postgres://localhost:5432   |
# | svc (dev)        | make svc          | make svc-down    |  9082 | http://127.0.0.1:9082       |
# | ui  (dev)        | make ui           | make ui-down     |  5173 | http://127.0.0.1:5173       |
# | helix (dev)      | make helix        | make helix-down  |  5174 | http://127.0.0.1:5174       |
# +------------------+-------------------+------------------+-------+-----------------------------+

SHELL    := /bin/bash
ENV_FILE := .env
COMPOSE  := docker compose --project-directory . -f infra/docker-compose.yml

SVC_DIR  := lc-checker-v2-svc
UI_DIR   := ui
HELIX_DIR  := tb-helix-ai-ui
HSVC_DIR   := tb-helix-ai-svc
LOG_DIR  := /tmp/lc-checker-v2

SVC_PORT     := 9082
UI_DEV_PORT  := 5173
HELIX_PORT   := 5174
HSVC_PORT    := 9090
DB_CONTAINER := lc-checker-postgres
DB_IMAGE     := postgres:16-alpine
DB_PORT      := 5432
DB_NAME      := lc_checker
DB_USER      := lcuser
DB_PASS      := lcdev
PRESETS_DIR  := $(abspath test/cases)

.DEFAULT_GOAL := help

# ---------------------------------------------------------------------------
# help
# ---------------------------------------------------------------------------
help:  ## list targets
	@echo ""
	@echo "  lc-checker-v2 — make <target>"
	@echo ""
	@awk 'BEGIN{FS=":.*##"} /^[a-zA-Z0-9_-]+:.*##/ {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""

# ---------------------------------------------------------------------------
# db — local Postgres (Docker / Colima)
# ---------------------------------------------------------------------------
_ensure-docker:
	@if docker info >/dev/null 2>&1; then exit 0; fi; \
	 if command -v colima >/dev/null 2>&1; then \
	   echo "→ starting Colima…"; colima start; \
	 else \
	   echo "✗ Docker not running — start Colima or Docker Desktop"; exit 1; \
	 fi

db: _ensure-docker  ## start local Postgres container — localhost:5432
	@set -a && [ -f $(ENV_FILE) ] && source $(ENV_FILE); set +a; \
	 db_name=$${DB_NAME:-$(DB_NAME)}; db_user=$${DB_USERNAME:-$(DB_USER)}; db_pass=$${DB_PASSWORD:-$(DB_PASS)}; \
	 if docker inspect -f '{{.State.Running}}' $(DB_CONTAINER) 2>/dev/null | grep -q true; then \
	   echo "✓ postgres already running ($(DB_CONTAINER)) → $$db_name"; \
	 else \
	   echo "→ starting postgres (database=$$db_name)…"; \
	   docker start $(DB_CONTAINER) 2>/dev/null || \
	     docker run -d --name $(DB_CONTAINER) --restart unless-stopped \
	       -e POSTGRES_DB=$$db_name -e POSTGRES_USER=$$db_user -e POSTGRES_PASSWORD=$$db_pass \
	       -p $(DB_PORT):5432 $(DB_IMAGE); \
	 fi
	@DB_NAME=$$(grep '^DB_NAME=' $(ENV_FILE) 2>/dev/null | cut -d= -f2-); \
	 $(MAKE) --no-print-directory db-wait DB_NAME=$${DB_NAME:-$(DB_NAME)}

db-reinit: _ensure-docker  ## destroy Postgres container + recreate fresh DB (uses .env DB_*)
	@echo "→ reinit postgres: database=$(DB_NAME) (container $(DB_CONTAINER))"
	@if docker inspect $(DB_CONTAINER) >/dev/null 2>&1; then \
	   docker rm -f $(DB_CONTAINER) && echo "✓ removed $(DB_CONTAINER)"; \
	 else echo "  (no existing container)"; fi
	@$(MAKE) --no-print-directory db

db-wait:  ## wait until Postgres accepts connections (used by db)
	@_db_name=$${DB_NAME:-$(DB_NAME)}; \
	 echo "→ waiting for postgres on :$(DB_PORT)/$$_db_name…"; \
	 set -e; \
	deadline=$$(( $$(date +%s) + 30 )); \
	while :; do \
	  if command -v nc >/dev/null 2>&1 && nc -z -w 1 127.0.0.1 $(DB_PORT) 2>/dev/null; then \
	    echo "✓ postgres → localhost:$(DB_PORT)/$$_db_name"; exit 0; \
	  fi; \
	  if [ $$(date +%s) -ge $$deadline ]; then \
	    echo "✗ timeout waiting for postgres"; docker logs --tail=50 $(DB_CONTAINER) 2>&1 || true; exit 1; \
	  fi; \
	  sleep 1; \
	done

db-down:  ## stop Postgres container
	@if docker inspect $(DB_CONTAINER) >/dev/null 2>&1; then \
	   docker stop $(DB_CONTAINER) && echo "✓ postgres stopped"; \
	 else echo "  (postgres container not found)"; fi

db-sessions-clean: _ensure-docker db-wait  ## wipe lc_v3 sessions; keep vision_extract_cache
	@_db_user=$$(grep '^DB_USERNAME=' $(ENV_FILE) 2>/dev/null | cut -d= -f2-); \
	 _db_name=$$(grep '^DB_NAME=' $(ENV_FILE) 2>/dev/null | cut -d= -f2-); \
	 _db_user=$${_db_user:-$(DB_USERNAME)}; \
	 _db_name=$${_db_name:-$(DB_NAME)}; \
	 echo "→ wiping lc_v3 sessions (preserving vision_extract_cache)…"; \
	 docker exec -i $(DB_CONTAINER) psql -U "$$_db_user" -d "$$_db_name" \
	   -f - < infra/postgres/migrations/03-wipe-sessions-keep-vision-cache.sql; \
	 echo "✓ sessions cleared"

deal-build:  ## build deal PDF fixtures (cases 01–03) — needs PDFs in test/cases/*
	@echo "→ building deal bundles (lc.txt + deal-NN.pdf + deal.manifest.yml)…"
	@if [ ! -d test/cases/scripts/.venv ]; then \
	   python3 -m venv test/cases/scripts/.venv && \
	   test/cases/scripts/.venv/bin/pip install -q -r test/cases/scripts/requirements.txt; \
	 fi
	@test/cases/scripts/.venv/bin/python test/cases/scripts/build-deal-tiff.py
	@echo "✓ deal bundles built"

# ---------------------------------------------------------------------------
# svc — Spring Boot (dev)
# ---------------------------------------------------------------------------
svc:  ## start Spring Boot service (foreground) — http://127.0.0.1:9082
	@echo "→ svc on :$(SVC_PORT) → http://127.0.0.1:$(SVC_PORT)   (Ctrl-C to stop)"
	@cd $(SVC_DIR) && set -a && source ../$(ENV_FILE) && set +a && \
	  PRESETS_DIR=$(PRESETS_DIR) ./gradlew bootRun

svc-watch:  ## bootRun + continuous compile — DevTools auto-restart on Java save (~3s)
	@echo "→ svc-watch on :$(SVC_PORT) — save .java / resources → auto-restart (Ctrl-C to stop)"
	@cd $(SVC_DIR) && set -a && source ../$(ENV_FILE) && set +a && \
	  PRESETS_DIR=$(PRESETS_DIR) bash -c '\
	    ./gradlew classes --continuous -q & _cpid=$$!; \
	    trap "kill $$_cpid 2>/dev/null" EXIT INT TERM; \
	    ./gradlew bootRun'

svc-down:  ## stop Spring Boot service (kills :9082)
	@pid=$$(lsof -ti tcp:$(SVC_PORT) 2>/dev/null); \
	  if [ -n "$$pid" ]; then kill $$pid && echo "✓ svc stopped (pid $$pid)"; \
	  else echo "  (svc not running on :$(SVC_PORT))"; fi

svc-wait:  ## wait until svc /actuator/health is UP (timeout 120s; used by make all)
	@echo "→ waiting for svc on :$(SVC_PORT)…"
	@set -e; \
	deadline=$$(( $$(date +%s) + 120 )); \
	while :; do \
	  if curl -fsS http://127.0.0.1:$(SVC_PORT)/actuator/health 2>/dev/null \
	      | grep -q '"status":"UP"'; then \
	    echo "✓ svc ready → http://127.0.0.1:$(SVC_PORT)"; exit 0; \
	  fi; \
	  if [ $$(date +%s) -ge $$deadline ]; then \
	    echo "✗ timeout waiting for svc — tail $(LOG_DIR)/svc.log:"; \
	    tail -40 $(LOG_DIR)/svc.log 2>/dev/null || true; exit 1; \
	  fi; \
	  sleep 2; \
	done

# ---------------------------------------------------------------------------
# ui — Vite dev server
# ---------------------------------------------------------------------------
ui: _ui-install  ## start Vite dev server (foreground) — http://127.0.0.1:5173
	@echo "→ ui on :$(UI_DEV_PORT) → http://127.0.0.1:$(UI_DEV_PORT)   (Ctrl-C to stop)"
	@cd $(UI_DIR) && npm run dev

ui-down:  ## stop Vite dev server (kills :5173)
	@pid=$$(lsof -ti tcp:$(UI_DEV_PORT) 2>/dev/null); \
	  if [ -n "$$pid" ]; then kill $$pid && echo "✓ ui stopped (pid $$pid)"; \
	  else echo "  (ui not running on :$(UI_DEV_PORT))"; fi

_ui-install:
	@if [ ! -d $(UI_DIR)/node_modules ]; then \
	   echo "→ installing $(UI_DIR) dependencies…"; \
	   cd $(UI_DIR) && npm install --silent; \
	   echo "✓ $(UI_DIR) ready"; \
	 fi

# ---------------------------------------------------------------------------
# helix — TB Helix AI UI: platform shell + lc-check + governance modules
# ---------------------------------------------------------------------------
helix: _helix-install  ## start TB Helix AI UI (foreground) — http://127.0.0.1:5174
	@echo "→ helix on :$(HELIX_PORT) → http://127.0.0.1:$(HELIX_PORT)   (Ctrl-C to stop)"
	@cd $(HELIX_DIR) && npm run dev

helix-bg: $(LOG_DIR) _helix-install  ## start TB Helix AI UI in background (log → /tmp/lc-checker-v2/helix.log)
	@$(MAKE) --no-print-directory helix-down 2>/dev/null || true
	@(cd $(HELIX_DIR) && nohup npm run dev > $(LOG_DIR)/helix.log 2>&1 &) \
	  && echo "✓ helix bg → http://127.0.0.1:$(HELIX_PORT)    (log: $(LOG_DIR)/helix.log)"

helix-down:  ## stop TB Helix AI UI (kills :5174)
	@pid=$$(lsof -ti tcp:$(HELIX_PORT) 2>/dev/null); \
	  if [ -n "$$pid" ]; then kill $$pid && echo "✓ helix stopped (pid $$pid)"; \
	  else echo "  (helix not running on :$(HELIX_PORT))"; fi

# ---------------------------------------------------------------------------
# tb-helix-ai-svc — the backend the helix UI will talk to.
#
# Runs alongside lc-checker-v2-svc rather than replacing it: the old service
# still serves ui/ until cutover, and they listen on different ports (9082/9090)
# against different schemas (lc_v3 / helix_*) in the same database.
# ---------------------------------------------------------------------------

.PHONY: hsvc hsvc-watch hsvc-bg hsvc-down hsvc-wait hsvc-build

hsvc:  ## start tb-helix-ai-svc (foreground) — :9090
	@echo "→ tb-helix-ai-svc on :$(HSVC_PORT)   (Ctrl-C to stop)"
	@cd $(HSVC_DIR) && set -a && source ../$(ENV_FILE) && set +a && ./gradlew bootRun

hsvc-watch:  ## start tb-helix-ai-svc with DevTools hot reload (~3s on save)
	@echo "→ tb-helix-ai-svc on :$(HSVC_PORT) with continuous build"
	@cd $(HSVC_DIR) && (./gradlew classes --continuous > /dev/null 2>&1 &) \
	  && set -a && source ../$(ENV_FILE) && set +a && ./gradlew bootRun

hsvc-bg: $(LOG_DIR)  ## start tb-helix-ai-svc in background (log → /tmp/lc-checker-v2/hsvc.log)
	@(cd $(HSVC_DIR) && set -a && source ../$(ENV_FILE) && set +a \
	   && nohup ./gradlew bootRun > $(LOG_DIR)/hsvc.log 2>&1 &) \
	  && echo "✓ tb-helix-ai-svc bg on :$(HSVC_PORT)   (log: $(LOG_DIR)/hsvc.log)"

hsvc-down:  ## stop tb-helix-ai-svc (kills :9090)
	@pid=$$(lsof -ti tcp:$(HSVC_PORT) 2>/dev/null); \
	 if [ -n "$$pid" ]; then kill $$pid && echo "✓ tb-helix-ai-svc stopped"; \
	 else echo "  (tb-helix-ai-svc not running on :$(HSVC_PORT))"; fi

hsvc-wait:  ## block until tb-helix-ai-svc reports UP
	@echo "→ waiting for :$(HSVC_PORT)/actuator/health …"
	@for i in $$(seq 1 60); do \
	   if curl -sf http://127.0.0.1:$(HSVC_PORT)/actuator/health 2>/dev/null | grep -q '"status":"UP"'; then \
	     echo "✓ tb-helix-ai-svc UP"; exit 0; fi; sleep 2; done; \
	 echo "✗ tb-helix-ai-svc did not come up — see $(LOG_DIR)/hsvc.log"; exit 1

hsvc-build:  ## compile + run the ArchUnit boundary rules
	@cd $(HSVC_DIR) && ./gradlew build


helix-build: _helix-install  ## production build → tb-helix-ai-ui/dist
	@cd $(HELIX_DIR) && npm run build

_helix-install:
	@if [ ! -d $(HELIX_DIR)/node_modules ]; then \
	   echo "→ installing $(HELIX_DIR) dependencies…"; \
	   cd $(HELIX_DIR) && npm install --silent; \
	   echo "✓ $(HELIX_DIR) ready"; \
	 fi

# ---------------------------------------------------------------------------
# all / all-down — both dev servers in background
# ---------------------------------------------------------------------------
$(LOG_DIR):
	@mkdir -p $(LOG_DIR)

all: db $(LOG_DIR) _ui-install  ## start db + svc + ui in background (logs → /tmp/lc-checker-v2/)
	@$(MAKE) --no-print-directory svc-down  2>/dev/null || true
	@$(MAKE) --no-print-directory ui-down   2>/dev/null || true
	@(cd $(SVC_DIR) && set -a && source ../$(ENV_FILE) && set +a && \
	  PRESETS_DIR=$(PRESETS_DIR) nohup ./gradlew bootRun > $(LOG_DIR)/svc.log 2>&1 &) \
	  && echo "✓ svc bg → http://127.0.0.1:$(SVC_PORT)    (log: $(LOG_DIR)/svc.log)"
	@$(MAKE) --no-print-directory svc-wait
	@(cd $(UI_DIR) && nohup npm run dev > $(LOG_DIR)/ui.log 2>&1 &) \
	  && echo "✓ ui  bg → http://127.0.0.1:$(UI_DEV_PORT)    (log: $(LOG_DIR)/ui.log)"
	@echo ""
	@echo "  stop:    make all-down   (keeps db)  |  make down   (stop all incl. db)"
	@echo "  status:  make status"

all-down:  ## stop svc + ui + helix (postgres container left running)
	@$(MAKE) --no-print-directory svc-down
	@$(MAKE) --no-print-directory ui-down
	@$(MAKE) --no-print-directory helix-down

down: all-down db-down  ## stop everything — svc + ui + postgres

# ---------------------------------------------------------------------------
# dep-* — Docker production deploy (via infra/docker-compose.yml)
# ---------------------------------------------------------------------------
dep-svc: pull  ## git pull + build + deploy lc-checker-v2-svc container (port 9082)
	$(COMPOSE) build lc-checker-v2-svc
	$(COMPOSE) up -d lc-checker-v2-svc
	@$(MAKE) --no-print-directory dep-svc-wait

dep-svc-wait:  ## tail svc logs until Spring is up or container fails (used by dep-svc)
	@echo "→ waiting for Spring to finish booting (timeout 120s)…"
	@set -e; \
	deadline=$$(( $$(date +%s) + 120 )); \
	while :; do \
	  state=$$(docker inspect -f '{{.State.Status}}' lc-checker-v2-svc 2>/dev/null || echo "missing"); \
	  if [ "$$state" = "exited" ] || [ "$$state" = "dead" ] || [ "$$state" = "missing" ]; then \
	    echo "✗ container $$state — last 200 log lines:"; \
	    docker logs --tail=200 lc-checker-v2-svc 2>&1 || true; \
	    exit 1; \
	  fi; \
	  if docker logs --tail=400 lc-checker-v2-svc 2>&1 | grep -qE 'Started LcCheckerV2Application'; then \
	    echo "✓ Spring up — dep-svc → http://127.0.0.1:$(SVC_PORT)"; \
	    exit 0; \
	  fi; \
	  if docker logs --tail=400 lc-checker-v2-svc 2>&1 | grep -qE 'APPLICATION FAILED TO START|UnsatisfiedDependencyException|Connection refused|Cannot create PoolableConnectionFactory|FATAL: '; then \
	    echo "✗ Spring boot failed — last 200 log lines:"; \
	    docker logs --tail=200 lc-checker-v2-svc 2>&1 || true; \
	    exit 1; \
	  fi; \
	  if [ $$(date +%s) -ge $$deadline ]; then \
	    echo "✗ timeout waiting for Spring — last 200 log lines:"; \
	    docker logs --tail=200 lc-checker-v2-svc 2>&1 || true; \
	    exit 1; \
	  fi; \
	  sleep 2; \
	done

dep-ui: pull  ## git pull + build + deploy lc-checker-v2-ui container (port 9080)
	$(COMPOSE) build ui-v2
	$(COMPOSE) up -d ui-v2
	@$(MAKE) --no-print-directory dep-ui-wait

dep-ui-wait:  ## poll :9080 until nginx serves a response or container fails (used by dep-ui)
	@echo "→ waiting for ui-v2 to start serving on :9080 (timeout 60s)…"
	@set -e; \
	deadline=$$(( $$(date +%s) + 60 )); \
	while :; do \
	  state=$$(docker inspect -f '{{.State.Status}}' lc-checker-v2-ui 2>/dev/null || echo "missing"); \
	  if [ "$$state" = "exited" ] || [ "$$state" = "dead" ] || [ "$$state" = "missing" ]; then \
	    echo "✗ container $$state — last 100 log lines:"; \
	    docker logs --tail=100 lc-checker-v2-ui 2>&1 || true; \
	    exit 1; \
	  fi; \
	  if curl -fsS -o /dev/null -m 2 http://127.0.0.1:9080/ 2>/dev/null; then \
	    echo "✓ ui-v2 up — dep-ui → http://127.0.0.1:9080"; \
	    exit 0; \
	  fi; \
	  if docker logs --tail=200 lc-checker-v2-ui 2>&1 | grep -qE 'emerg|\[error\] .*could not bind|nginx: \[emerg\]'; then \
	    echo "✗ nginx config/bind error — last 100 log lines:"; \
	    docker logs --tail=100 lc-checker-v2-ui 2>&1 || true; \
	    exit 1; \
	  fi; \
	  if [ $$(date +%s) -ge $$deadline ]; then \
	    echo "✗ timeout waiting for ui-v2 — last 100 log lines:"; \
	    docker logs --tail=100 lc-checker-v2-ui 2>&1 || true; \
	    exit 1; \
	  fi; \
	  sleep 2; \
	done

dep-all: dep-svc dep-ui  ## build + deploy both containers

dep-svc-down:  ## stop + remove lc-checker-v2-svc container
	$(COMPOSE) stop lc-checker-v2-svc
	$(COMPOSE) rm -f lc-checker-v2-svc

dep-ui-down:  ## stop + remove lc-checker-v2-ui container
	$(COMPOSE) stop ui-v2
	$(COMPOSE) rm -f ui-v2

# ---------------------------------------------------------------------------
# status / health / pull
# ---------------------------------------------------------------------------
status:  ## show port-listen status for db + svc + ui
	@db_host=$$(grep '^DB_HOST=' $(ENV_FILE) 2>/dev/null | cut -d= -f2-); \
	 db_port=$$(grep '^DB_PORT=' $(ENV_FILE) 2>/dev/null | cut -d= -f2-); \
	 db_host=$${db_host:-localhost}; db_port=$${db_port:-$(DB_PORT)}; \
	 printf '  %-12s %-20s %-8s %s\n' service host:port status url; \
	 printf '  %-12s %-20s %-8s %s\n' ------------ -------------------- -------- ---; \
	 if command -v nc >/dev/null 2>&1 && nc -z -w 2 "$$db_host" "$$db_port" 2>/dev/null; then db_state="✓ up"; else db_state="·"; fi; \
	 printf '  %-12s %-20s %-8s %s\n' "postgres" "$$db_host:$$db_port" "$$db_state" "postgres://$$db_host:$$db_port"; \
	 for entry in "svc:$(SVC_PORT):http://127.0.0.1:$(SVC_PORT)" \
	              "ui:$(UI_DEV_PORT):http://127.0.0.1:$(UI_DEV_PORT)" \
	              "helix:$(HELIX_PORT):http://127.0.0.1:$(HELIX_PORT)"; do \
	   name=$$(echo "$$entry" | cut -d: -f1); \
	   port=$$(echo "$$entry" | cut -d: -f2); \
	   url=$$(echo "$$entry"  | cut -d: -f3-); \
	   if lsof -i tcp:$$port -sTCP:LISTEN >/dev/null 2>&1; then state="✓ up"; else state="·"; fi; \
	   printf '  %-12s %-20s %-8s %s\n' "$$name" "127.0.0.1:$$port" "$$state" "$$url"; \
	 done

health:  ## hit /actuator/health on the running svc
	@echo -n "SVC health (:$(SVC_PORT)): "
	@curl -fsS http://127.0.0.1:$(SVC_PORT)/actuator/health 2>/dev/null \
	  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','?'))" \
	  || echo "UNREACHABLE"

pull:  ## git pull --ff-only origin main
	@git pull --ff-only origin main

langfuse-auth:  ## derive LANGFUSE_AUTH_BASIC from .env keys and write it back
	@pk=$$(grep '^LANGFUSE_PUBLIC_KEY=' $(ENV_FILE) | cut -d= -f2); \
	 sk=$$(grep '^LANGFUSE_SECRET_KEY=' $(ENV_FILE) | cut -d= -f2); \
	 if [ -z "$$pk" ] || [ -z "$$sk" ]; then \
	   echo "✗ LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY not found in $(ENV_FILE)"; exit 1; \
	 fi; \
	 auth=$$(python3 -c "import base64; print(base64.b64encode((\"$$pk\"+':'+\"$$sk\").encode()).decode())"); \
	 if grep -q '^LANGFUSE_AUTH_BASIC=' $(ENV_FILE); then \
	   sed -i '' "s|^LANGFUSE_AUTH_BASIC=.*|LANGFUSE_AUTH_BASIC=$${auth}|" $(ENV_FILE); \
	 else \
	   printf '\nLANGFUSE_AUTH_BASIC=%s\n' "$$auth" >> $(ENV_FILE); \
	 fi; \
	 echo "✓ LANGFUSE_AUTH_BASIC updated in $(ENV_FILE)"

.PHONY: help \
        _ensure-docker db db-wait db-down db-reinit db-sessions-clean \
        svc svc-watch svc-down svc-wait \
        ui ui-down _ui-install \
        helix helix-bg helix-down helix-build _helix-install \
        all all-down down \
        dep-svc dep-svc-wait dep-ui dep-ui-wait dep-all dep-svc-down dep-ui-down \
        status health pull langfuse-auth
