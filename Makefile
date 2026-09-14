# WebMind developer commands.
#
# Run `make` on its own to see everything available.
#
# Windows note: GNU Make picks up Git Bash's sh.exe when it is on PATH, which
# is what these recipes are written for. Run them from Git Bash.

COMPOSE := docker compose
SERVICE := postgres

# Must match docker-compose.yml, and DATABASE_URL in services/api/.env.
DB_USER := webmind
DB_NAME := webmind
DB_PORT := 5433

API_DIR := services/api

# How long `make docker` waits for the daemon, in 2-second ticks.
DOCKER_WAIT_TICKS := 90

.DEFAULT_GOAL := help

.PHONY: help docker up down restart ps logs psql db-reset migrate generate

help: ## Show this help
	@echo "WebMind make targets:"
	@echo
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | sort \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-10s %s\n", $$1, $$2}'
	@echo
	@echo "Postgres listens on localhost:$(DB_PORT) (5432 is taken by another project)."

docker: ## Start Docker Desktop and wait for the daemon
	@if docker info >/dev/null 2>&1; then \
	  echo "Docker is already running."; \
	  exit 0; \
	fi; \
	echo "Starting Docker Desktop..."; \
	started=0; \
	for exe in "$$LOCALAPPDATA/Programs/DockerDesktop/Docker Desktop.exe" \
	           "/c/Program Files/Docker/Docker/Docker Desktop.exe"; do \
	  if [ -x "$$exe" ]; then "$$exe" >/dev/null 2>&1 & started=1; break; fi; \
	done; \
	if [ "$$started" = "0" ]; then \
	  echo "Could not find Docker Desktop. Start it yourself, then rerun."; \
	  exit 1; \
	fi; \
	ticks=0; \
	until docker info >/dev/null 2>&1; do \
	  ticks=$$((ticks + 1)); \
	  if [ $$ticks -gt $(DOCKER_WAIT_TICKS) ]; then \
	    echo "Docker did not come up in time."; \
	    exit 1; \
	  fi; \
	  sleep 2; \
	done; \
	echo "Docker is ready."

up: docker ## Start Postgres and wait until it is accepting connections
	@$(COMPOSE) up -d --wait
	@echo "Postgres is up on localhost:$(DB_PORT)."

down: ## Stop Postgres, keeping its data
	@$(COMPOSE) down

restart: down up ## Stop and start Postgres

ps: ## Show container status
	@$(COMPOSE) ps

logs: ## Follow Postgres logs
	@$(COMPOSE) logs -f $(SERVICE)

# If Git Bash reports "the input device is not a TTY", run `winpty make psql`.
psql: ## Open a psql shell on the WebMind database
	@$(COMPOSE) exec $(SERVICE) psql -U $(DB_USER) -d $(DB_NAME)

db-reset: ## Delete the database volume and recreate it from migrations
	@echo "This destroys every page, conversation and stored API key in the dev database."
	@printf "Type 'reset' to confirm: "; \
	read answer; \
	if [ "$$answer" != "reset" ]; then echo "Cancelled."; exit 1; fi; \
	$(COMPOSE) down -v
	@$(MAKE) --no-print-directory up
	@$(MAKE) --no-print-directory migrate

migrate: up ## Apply Prisma migrations to the running database
	@cd $(API_DIR) && npm run prisma:migrate

generate: ## Regenerate the Prisma client
	@cd $(API_DIR) && npm run prisma:generate
