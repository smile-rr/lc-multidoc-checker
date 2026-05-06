# lc-checker-v2 — Makefile
#
# Dev (foreground, Ctrl-C to stop):
#   make svc                   Spring Boot on :9082
#   make ui                    Vite dev server on :5173
#
# Stop dev processes:
#   make svc-down              kill :9082
#   make ui-down               kill :5173
#
# Both in background:
#   make all                   svc + ui in background (logs → /tmp/lc-checker-v2/)
#   make all-down              stop both
#
# Docker production (runs docker compose from infra/):
#   make dep-svc               build + deploy lc-checker-v2-svc
#   make dep-ui                build + deploy lc-checker-v2-ui
#   make dep-all               build + deploy both
#   make dep-svc-down          stop + remove lc-checker-v2-svc container
#   make dep-ui-down           stop + remove lc-checker-v2-ui container
#
# Utilities:
#   make status                port-listen check for svc + ui
#   make health                hit /actuator/health on the running svc
#   make pull                  git pull --ff-only origin main
#   make langfuse-auth         derive LANGFUSE_AUTH_BASIC from .env keys
#
# +------------------+-------------------+------------------+-------+-----------------------------+
# | Component        | Up                | Down             | Port  | URL                         |
# +------------------+-------------------+------------------+-------+-----------------------------+
# | svc (dev)        | make svc          | make svc-down    |  9082 | http://127.0.0.1:9082       |
# | ui  (dev)        | make ui           | make ui-down     |  5173 | http://127.0.0.1:5173       |
# | svc (docker)     | make dep-svc      | make dep-svc-down|  9082 | http://127.0.0.1:9082       |
# | ui  (docker)     | make dep-ui       | make dep-ui-down |  9080 | http://127.0.0.1:9080       |
# +------------------+-------------------+------------------+-------+-----------------------------+

SHELL    := /bin/bash
ENV_FILE := .env
COMPOSE  := docker compose --project-directory . -f infra/docker-compose.yml

SVC_DIR  := lc-checker-v2-svc
UI_DIR   := ui
LOG_DIR  := /tmp/lc-checker-v2

SVC_PORT := 9082
UI_DEV_PORT := 5173

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
# svc — Spring Boot (dev)
# ---------------------------------------------------------------------------
svc:  ## start Spring Boot service (foreground) — http://127.0.0.1:9082
	@echo "→ svc on :$(SVC_PORT) → http://127.0.0.1:$(SVC_PORT)   (Ctrl-C to stop)"
	@cd $(SVC_DIR) && set -a && source ../$(ENV_FILE) && set +a && ./gradlew bootRun

svc-down:  ## stop Spring Boot service (kills :9082)
	@pid=$$(lsof -ti tcp:$(SVC_PORT) 2>/dev/null); \
	  if [ -n "$$pid" ]; then kill $$pid && echo "✓ svc stopped (pid $$pid)"; \
	  else echo "  (svc not running on :$(SVC_PORT))"; fi

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
# all / all-down — both dev servers in background
# ---------------------------------------------------------------------------
$(LOG_DIR):
	@mkdir -p $(LOG_DIR)

all: $(LOG_DIR) _ui-install  ## start svc + ui in background (logs → /tmp/lc-checker-v2/)
	@$(MAKE) --no-print-directory svc-down  2>/dev/null || true
	@$(MAKE) --no-print-directory ui-down   2>/dev/null || true
	@(cd $(SVC_DIR) && set -a && source ../$(ENV_FILE) && set +a && \
	  nohup ./gradlew bootRun > $(LOG_DIR)/svc.log 2>&1 &) \
	  && echo "✓ svc bg → http://127.0.0.1:$(SVC_PORT)    (log: $(LOG_DIR)/svc.log)"
	@(cd $(UI_DIR) && nohup npm run dev > $(LOG_DIR)/ui.log 2>&1 &) \
	  && echo "✓ ui  bg → http://127.0.0.1:$(UI_DEV_PORT)    (log: $(LOG_DIR)/ui.log)"
	@echo ""
	@echo "  stop:    make all-down"
	@echo "  status:  make status"

all-down:  ## stop both dev servers
	@$(MAKE) --no-print-directory svc-down
	@$(MAKE) --no-print-directory ui-down

# ---------------------------------------------------------------------------
# dep-* — Docker production deploy (via infra/docker-compose.yml)
# ---------------------------------------------------------------------------
dep-svc: pull  ## git pull + build + deploy lc-checker-v2-svc container (port 9082)
	$(COMPOSE) build lc-checker-v2-svc
	$(COMPOSE) up -d lc-checker-v2-svc
	@echo "✓ dep-svc → http://127.0.0.1:$(SVC_PORT)"

dep-ui: pull  ## git pull + build + deploy lc-checker-v2-ui container (port 9080)
	$(COMPOSE) build ui-v2
	$(COMPOSE) up -d ui-v2
	@echo "✓ dep-ui → http://127.0.0.1:9080"

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
status:  ## show port-listen status for svc + ui
	@printf '  %-12s %-20s %-8s %s\n' service host:port status url
	@printf '  %-12s %-20s %-8s %s\n' ------------ -------------------- -------- ---
	@for entry in "svc (dev):$(SVC_PORT):http://127.0.0.1:$(SVC_PORT)" \
	              "ui  (dev):$(UI_DEV_PORT):http://127.0.0.1:$(UI_DEV_PORT)" \
	              "ui  (docker):9080:http://127.0.0.1:9080"; do \
	   name=$$(echo "$$entry" | cut -d: -f1); \
	   port=$$(echo "$$entry" | cut -d: -f2); \
	   url=$$(echo "$$entry"  | cut -d: -f3-); \
	   if lsof -i tcp:$$port -sTCP:LISTEN >/dev/null 2>&1; then state="✓ up"; else state="·"; fi; \
	   printf '  %-12s %-20s %-8s %s\n' "$$name" "127.0.0.1:$$port" "$$state" "$$url"; \
	 done
	@db_host=192.168.31.214; db_port=5436; \
	 if command -v nc >/dev/null 2>&1 && nc -z -w 2 "$$db_host" "$$db_port" 2>/dev/null; then db_state="✓ up"; else db_state="·"; fi; \
	 printf '  %-12s %-20s %-8s %s\n' "postgres" "$$db_host:$$db_port" "$$db_state" "postgres://$$db_host:$$db_port"

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
        svc svc-down \
        ui ui-down _ui-install \
        all all-down \
        dep-svc dep-ui dep-all dep-svc-down dep-ui-down \
        status health pull langfuse-auth
