# Makefile for Horsey Backend Docker operations

# Load environment variables
include .env

# Variables
IMAGE_NAME ?= $(DOCKERHUB_USERNAME)/horsey-backend
TAG ?= latest

.PHONY: build push run stop dev test clean logs monitoring

# Build Docker image
build:
	docker build -t $(IMAGE_NAME):$(TAG) .

# Push Docker image to registry
push:
	docker push $(IMAGE_NAME):$(TAG)

# Run production environment
run:
	docker-compose -f docker-compose.prod.yml up -d

# Run development environment
dev:
	docker-compose -f docker-compose.dev.yml up

# Run tests
test:
	docker-compose -f docker-compose.dev.yml run --rm app npm test

# Stop and remove containers
stop:
	docker-compose -f docker-compose.prod.yml down

# Stop development environment
dev-stop:
	docker-compose -f docker-compose.dev.yml down

# Remove all unused containers, networks, images
clean:
	docker system prune -a --volumes

# Show logs
logs:
	docker-compose -f docker-compose.prod.yml logs -f app

# Start monitoring stack
monitoring:
	docker-compose -f docker-compose.monitoring.yml up -d

# Stop monitoring stack
monitoring-stop:
	docker-compose -f docker-compose.monitoring.yml down

# Full deployment including monitoring
deploy-all: run monitoring
	@echo "Deployment complete!"

# Backup MongoDB data
backup:
	@mkdir -p ./backups
	docker exec mongodb mongodump --username $(MONGO_INITDB_ROOT_USERNAME) --password $(MONGO_INITDB_ROOT_PASSWORD) --authenticationDatabase admin --out /data/db/backup
	docker cp mongodb:/data/db/backup ./backups/backup_$(shell date +%Y%m%d_%H%M%S)
	@echo "Backup created in ./backups directory"

# Restore MongoDB data
restore:
	@if [ -z "$(BACKUP_DIR)" ]; then echo "Please specify BACKUP_DIR"; exit 1; fi
	docker cp $(BACKUP_DIR) mongodb:/data/db/backup_to_restore
	docker exec mongodb mongorestore --username $(MONGO_INITDB_ROOT_USERNAME) --password $(MONGO_INITDB_ROOT_PASSWORD) --authenticationDatabase admin /data/db/backup_to_restore
	@echo "Restored from $(BACKUP_DIR)"

# Show help
help:
	@echo "Horsey Backend Docker Commands:"
	@echo "  make build          - Build Docker image"
	@echo "  make push           - Push Docker image to registry"
	@echo "  make run            - Run production environment"
	@echo "  make dev            - Run development environment"
	@echo "  make test           - Run tests"
	@echo "  make stop           - Stop production environment"
	@echo "  make dev-stop       - Stop development environment"
	@echo "  make clean          - Remove all unused Docker resources"
	@echo "  make logs           - Show logs"
	@echo "  make monitoring     - Start monitoring stack"
	@echo "  make monitoring-stop - Stop monitoring stack"
	@echo "  make deploy-all     - Deploy application and monitoring"
	@echo "  make backup         - Backup MongoDB data"
	@echo "  make restore BACKUP_DIR=./backups/backup_20250101_120000 - Restore MongoDB data"
