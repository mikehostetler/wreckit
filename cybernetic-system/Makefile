# Cybernetic VSM Framework Makefile

.PHONY: help test build deploy clean

# Variables
DOCKER_REGISTRY ?= ghcr.io
DOCKER_IMAGE ?= your-org/cybernetic
VERSION ?= $(shell git describe --tags --always --dirty)
DOCKER_TAG = $(DOCKER_REGISTRY)/$(DOCKER_IMAGE):$(VERSION)

# Colors for output
RED := \033[0;31m
GREEN := \033[0;32m
YELLOW := \033[0;33m
NC := \033[0m # No Color

help: ## Show this help message
	@echo "Cybernetic VSM Framework - Available Commands:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""

# Development
deps: ## Install dependencies
	mix deps.get
	mix deps.compile

dev: ## Start development server
	iex -S mix

test: ## Run tests
	MIX_ENV=test mix test

test-coverage: ## Run tests with coverage
	MIX_ENV=test mix coveralls.html

test-integration: ## Run integration tests (requires services: PostgreSQL, RabbitMQ)
	MIX_ENV=integration mix test --include integration

format: ## Format code
	mix format

lint: ## Run linter
	mix credo --strict

check: format lint test ## Run all checks

# Docker
docker-build: ## Build Docker image
	docker build -t $(DOCKER_TAG) .
	docker tag $(DOCKER_TAG) $(DOCKER_REGISTRY)/$(DOCKER_IMAGE):latest

docker-push: ## Push Docker image to registry
	docker push $(DOCKER_TAG)
	docker push $(DOCKER_REGISTRY)/$(DOCKER_IMAGE):latest

docker-run: ## Run Docker container locally
	docker run -it --rm \
		-p 4000:4000 \
		--env-file .env \
		$(DOCKER_TAG)

# Docker Compose
up: ## Start all services with docker-compose
	docker-compose up -d

down: ## Stop all services
	docker-compose down

logs: ## Show logs from all services
	docker-compose logs -f

restart: ## Restart all services
	docker-compose restart

ps: ## Show running services
	docker-compose ps

# Testing specific services
test-rabbitmq: ## Test RabbitMQ connectivity
	mix run test_amqp.exs

test-s4: ## Test S4 Intelligence Hub
	mix run prove_s4_integration.exs

test-memory: ## Test S4 Memory system
	mix run prove_memory_integration.exs

# Kubernetes
k8s-deploy: ## Deploy to Kubernetes
	kubectl apply -f k8s/base/namespace.yaml
	kubectl apply -f k8s/base/

k8s-delete: ## Delete from Kubernetes
	kubectl delete -f k8s/base/

k8s-logs: ## Show Kubernetes logs
	kubectl logs -n cybernetic -l app=cybernetic -f

k8s-status: ## Show Kubernetes deployment status
	kubectl get all -n cybernetic

# Database
db-create: ## Create database
	mix ecto.create

db-migrate: ## Run database migrations
	mix ecto.migrate

db-reset: ## Reset database
	mix ecto.drop
	mix ecto.create
	mix ecto.migrate

db-seed: ## Seed database
	mix run priv/repo/seeds.exs

# Release
release: ## Build production release
	MIX_ENV=prod mix release

release-docker: docker-build docker-push ## Build and push Docker release

# Utilities
clean: ## Clean build artifacts
	rm -rf _build deps .elixir_ls cover doc
	docker-compose down -v

setup: ## Initial project setup
	@echo "$(GREEN)Setting up Cybernetic VSM Framework...$(NC)"
	cp .env.example .env
	@echo "$(YELLOW)Please edit .env with your configuration$(NC)"
	mix deps.get
	docker-compose pull
	@echo "$(GREEN)Setup complete!$(NC)"

verify: ## Verify system is working
	@echo "$(GREEN)Verifying Cybernetic VSM Framework...$(NC)"
	@echo "Checking Elixir..."
	@elixir --version
	@echo ""
	@echo "Checking Docker..."
	@docker --version
	@echo ""
	@echo "Checking Docker Compose..."
	@docker-compose --version
	@echo ""
	@echo "$(GREEN)All systems ready!$(NC)"

# CI/CD
ci: check test-coverage ## Run CI pipeline locally

cd-staging: ## Deploy to staging
	@echo "$(YELLOW)Deploying to staging...$(NC)"
	# Add staging deployment commands

cd-production: ## Deploy to production
	@echo "$(RED)Deploying to production...$(NC)"
	@echo "$(YELLOW)Are you sure? [y/N]$(NC)"
	@read -r REPLY; \
	if [ "$$REPLY" = "y" ]; then \
		echo "$(GREEN)Deploying...$(NC)"; \
		# Add production deployment commands \
	else \
		echo "$(YELLOW)Deployment cancelled$(NC)"; \
	fi

# Monitoring
monitor: ## Open monitoring dashboard
	@echo "$(GREEN)Opening monitoring dashboards...$(NC)"
	open http://localhost:3000      # Grafana
	open http://localhost:15672     # RabbitMQ Management
	open http://localhost:9090      # Prometheus

# Default target
.DEFAULT_GOAL := help