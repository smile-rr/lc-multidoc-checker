# TB Helix — local development
#
# Three things run: a database, a service, a browser app.
#
#   make up        start all three (background)
#   make down      stop all three
#   make status    what is up
#
# One at a time, in the foreground, when you want to watch it:
#
#   make db        Postgres  :5432   (Docker — always background, it has no output worth watching)
#   make svc       backend   :9090
#   make ui        frontend  :5174   → http://127.0.0.1:5174
#
# While working:
#
#   make watch     the backend, restarting itself ~3s after you save a .java file
#   make logs      follow whatever `make up` started
#   make health    is the backend answering
#   make build     compile the backend + run the boundary rules, then build the UI
#   make db-reset  throw the database away and start again (the service recreates it)
#
# Everything reads .env — copy .env.example and fill in the model keys.
#
# Deploying is not here. It was, for two services that are being deleted, and a
# target that half-works is worse than one that does not exist.

SHELL    := /bin/bash
ENV_FILE := .env

SVC_DIR  := tb-helix-ai-svc
UI_DIR   := tb-helix-ai-ui
LOG_DIR  := /tmp/helix

SVC_PORT := 9090
UI_PORT  := 5174

DB_CONTAINER := lc-checker-postgres
DB_IMAGE     := postgres:16-alpine
DB_PORT      := 5432
DB_NAME      := lc_checker
DB_USER      := lcuser
DB_PASS      := lcdev

.DEFAULT_GOAL := help

.PHONY: help up down db db-down db-reset db-wait db-shell \
        svc svc-down svc-wait watch ui ui-down build logs status health \
        _docker _npm

# ---------------------------------------------------------------------------

help:  ## this list
	@echo ""
	@echo "  TB Helix — make <target>"
	@echo ""
	@awk 'BEGIN{FS=":.*##"} /^[a-z][a-zA-Z0-9_-]*:.*##/ {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""
	@echo "  db :$(DB_PORT)   svc :$(SVC_PORT)   ui http://127.0.0.1:$(UI_PORT)"
	@echo ""

# ---------------------------------------------------------------------------
# Everything at once
# ---------------------------------------------------------------------------

up: db $(LOG_DIR) _npm  ## start db + svc + ui in the background
	@$(MAKE) --no-print-directory svc-down >/dev/null 2>&1 || true
	@$(MAKE) --no-print-directory ui-down  >/dev/null 2>&1 || true
	@(cd $(SVC_DIR) && set -a && source ../$(ENV_FILE) && set +a \
	   && nohup ./gradlew bootRun > $(LOG_DIR)/svc.log 2>&1 &) \
	  && echo "→ svc starting  (log: $(LOG_DIR)/svc.log)"
	@$(MAKE) --no-print-directory svc-wait
	@(cd $(UI_DIR) && nohup npm run dev > $(LOG_DIR)/ui.log 2>&1 &) \
	  && echo "✓ ui  → http://127.0.0.1:$(UI_PORT)   (log: $(LOG_DIR)/ui.log)"
	@echo ""
	@echo "   make logs    follow    |    make down    stop"
	@echo ""

down: svc-down ui-down db-down  ## stop db + svc + ui

# ---------------------------------------------------------------------------
# Database — Postgres in Docker
# ---------------------------------------------------------------------------

_docker:
	@if docker info >/dev/null 2>&1; then exit 0; fi; \
	 if command -v colima >/dev/null 2>&1; then echo "→ starting Colima…"; colima start; \
	 else echo "✗ Docker is not running — start Colima or Docker Desktop"; exit 1; fi

db: _docker  ## start Postgres :5432
	@set -a && [ -f $(ENV_FILE) ] && source $(ENV_FILE); set +a; \
	 name=$${DB_NAME:-$(DB_NAME)}; user=$${DB_USERNAME:-$(DB_USER)}; pass=$${DB_PASSWORD:-$(DB_PASS)}; \
	 if docker inspect -f '{{.State.Running}}' $(DB_CONTAINER) 2>/dev/null | grep -q true; then \
	   echo "✓ postgres already up → $$name"; \
	 else \
	   docker start $(DB_CONTAINER) 2>/dev/null || \
	     docker run -d --name $(DB_CONTAINER) --restart unless-stopped \
	       -e POSTGRES_DB=$$name -e POSTGRES_USER=$$user -e POSTGRES_PASSWORD=$$pass \
	       -p $(DB_PORT):5432 $(DB_IMAGE) >/dev/null; \
	   $(MAKE) --no-print-directory db-wait; \
	 fi

db-wait:
	@for i in $$(seq 1 30); do \
	   if nc -z -w 1 127.0.0.1 $(DB_PORT) 2>/dev/null; then echo "✓ postgres → :$(DB_PORT)"; exit 0; fi; \
	   sleep 1; done; \
	 echo "✗ postgres did not start"; docker logs --tail=30 $(DB_CONTAINER) 2>&1 || true; exit 1

db-down:  ## stop Postgres
	@if docker inspect $(DB_CONTAINER) >/dev/null 2>&1; then \
	   docker stop $(DB_CONTAINER) >/dev/null && echo "✓ postgres stopped"; \
	 else echo "· postgres was not running"; fi

db-reset: _docker  ## delete the database and start a fresh one
	@echo "→ removing $(DB_CONTAINER) — every case, every cached reading, gone"
	@docker rm -f $(DB_CONTAINER) >/dev/null 2>&1 || true
	@$(MAKE) --no-print-directory db
	@echo "  the service recreates the schema and reseeds the catalogue on its next start"

db-shell:  ## open psql on the running database
	@set -a && [ -f $(ENV_FILE) ] && source $(ENV_FILE); set +a; \
	 docker exec -it $(DB_CONTAINER) psql -U $${DB_USERNAME:-$(DB_USER)} -d $${DB_NAME:-$(DB_NAME)}

# ---------------------------------------------------------------------------
# Backend
# ---------------------------------------------------------------------------

svc:  ## run the backend in the foreground
	@echo "→ svc :$(SVC_PORT)   (Ctrl-C to stop)"
	@cd $(SVC_DIR) && set -a && source ../$(ENV_FILE) && set +a && ./gradlew bootRun

watch:  ## run the backend, rebuilding on save (~3s)
	@echo "→ svc :$(SVC_PORT) with hot reload   (Ctrl-C to stop)"
	@cd $(SVC_DIR) && (./gradlew classes --continuous >/dev/null 2>&1 &) \
	  && set -a && source ../$(ENV_FILE) && set +a && ./gradlew bootRun

svc-down:  ## stop the backend
	@pid=$$(lsof -ti tcp:$(SVC_PORT) 2>/dev/null); \
	 if [ -n "$$pid" ]; then kill $$pid && echo "✓ svc stopped"; else echo "· svc was not running"; fi

svc-wait:
	@for i in $$(seq 1 90); do \
	   if curl -sf http://127.0.0.1:$(SVC_PORT)/actuator/health 2>/dev/null | grep -q '"status":"UP"'; then \
	     echo "✓ svc → http://127.0.0.1:$(SVC_PORT)"; exit 0; fi; sleep 2; done; \
	 echo "✗ svc did not come up — tail $(LOG_DIR)/svc.log"; exit 1

# ---------------------------------------------------------------------------
# Frontend
# ---------------------------------------------------------------------------

_npm:
	@if [ ! -d $(UI_DIR)/node_modules ]; then \
	   echo "→ installing UI dependencies…"; cd $(UI_DIR) && npm install --silent; fi

ui: _npm  ## run the frontend in the foreground
	@echo "→ ui → http://127.0.0.1:$(UI_PORT)   (Ctrl-C to stop)"
	@cd $(UI_DIR) && npm run dev

ui-down:  ## stop the frontend
	@pid=$$(lsof -ti tcp:$(UI_PORT) 2>/dev/null); \
	 if [ -n "$$pid" ]; then kill $$pid && echo "✓ ui stopped"; else echo "· ui was not running"; fi

# ---------------------------------------------------------------------------
# Checking on it
# ---------------------------------------------------------------------------

build: _npm  ## compile the backend, run the boundary rules, build the UI
	@cd $(SVC_DIR) && ./gradlew build
	@cd $(UI_DIR) && npm run smoke && npm run build

status:  ## what is up
	@printf '  %-8s %-22s %s\n' service address state
	@printf '  %-8s %-22s %s\n' -------- ---------------------- -----
	@if nc -z -w 1 127.0.0.1 $(DB_PORT) 2>/dev/null; then s="✓ up"; else s="·"; fi; \
	 printf '  %-8s %-22s %s\n' postgres "127.0.0.1:$(DB_PORT)" "$$s"
	@if lsof -i tcp:$(SVC_PORT) -sTCP:LISTEN >/dev/null 2>&1; then s="✓ up"; else s="·"; fi; \
	 printf '  %-8s %-22s %s\n' svc "http://127.0.0.1:$(SVC_PORT)" "$$s"
	@if lsof -i tcp:$(UI_PORT) -sTCP:LISTEN >/dev/null 2>&1; then s="✓ up"; else s="·"; fi; \
	 printf '  %-8s %-22s %s\n' ui "http://127.0.0.1:$(UI_PORT)" "$$s"

health:  ## ask the backend how it is
	@printf 'svc :$(SVC_PORT) → '
	@curl -fsS http://127.0.0.1:$(SVC_PORT)/actuator/health 2>/dev/null \
	  | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))" \
	  || echo "unreachable"

logs:  ## follow the logs from `make up`
	@tail -f $(LOG_DIR)/svc.log $(LOG_DIR)/ui.log

$(LOG_DIR):
	@mkdir -p $(LOG_DIR)
