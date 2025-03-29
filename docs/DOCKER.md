# Docker Setup and Deployment Guide

This guide explains how to set up and deploy the Horsey Backend using Docker containers. The setup includes containerized services for the backend application, MongoDB database, and monitoring tools.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Development Setup](#development-setup)
4. [Production Deployment](#production-deployment)
5. [Environment Variables](#environment-variables)
6. [Docker Compose Files](#docker-compose-files)
7. [Monitoring](#monitoring)
8. [Database Management](#database-management)
9. [CI/CD Integration](#cicd-integration)
10. [Troubleshooting](#troubleshooting)

## Prerequisites

- Docker Engine (version 20.10.0+)
- Docker Compose (version 2.0.0+)
- Git
- Make (optional, for using Makefile commands)

## Quick Start

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd backend
   ```

2. Copy the example environment file and configure it:
   ```bash
   cp .env.example .env
   # Edit .env file with your settings
   ```

3. Start the application using Docker Compose:
   ```bash
   # Using Make
   make run
   
   # Without Make
   docker-compose -f docker-compose.prod.yml up -d
   ```

4. The API will be available at http://localhost:5000

## Development Setup

For development with hot-reloading:

```bash
# Using Make
make dev

# Without Make
docker-compose -f docker-compose.dev.yml up
```

This mounts your local code into the container, enabling live code changes to be reflected immediately.

### Running Tests in Docker

```bash
# Using Make
make test

# Without Make
docker-compose -f docker-compose.dev.yml run --rm app npm test
```

## Production Deployment

For production deployment:

1. Build and push the Docker image:
   ```bash
   # Using Make
   make build
   make push
   
   # Without Make
   docker build -t yourusername/horsey-backend:latest .
   docker push yourusername/horsey-backend:latest
   ```

2. On your production server:
   ```bash
   # Set up your environment variables in .env
   docker-compose -f docker-compose.prod.yml pull
   docker-compose -f docker-compose.prod.yml up -d
   ```

### Full-Stack Deployment

To deploy both frontend and backend together:

```bash
docker-compose -f docker-compose.fullstack.yml up -d
```

## Environment Variables

Key environment variables required for the Docker setup:

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB connection string | mongodb://mongodb:27017/horsey |
| `JWT_SECRET` | Secret for JWT tokens | (required) |
| `SESSION_SECRET` | Secret for sessions | (required) |
| `MONGO_INITDB_ROOT_USERNAME` | MongoDB root username | admin |
| `MONGO_INITDB_ROOT_PASSWORD` | MongoDB root password | (required) |
| `DOCKERHUB_USERNAME` | Docker Hub username | (required for prod) |

See `.env.example` for a complete list of environment variables.

## Docker Compose Files

The project includes several Docker Compose files for different purposes:

- `docker-compose.dev.yml`: Development environment with hot reloading
- `docker-compose.prod.yml`: Production deployment with pre-built images
- `docker-compose.fullstack.yml`: Full-stack deployment with frontend and backend
- `docker-compose.monitoring.yml`: Monitoring stack with Prometheus and Grafana

## Monitoring

The application includes a Prometheus-compatible metrics endpoint at `/metrics` and a monitoring stack.

To start the monitoring stack:

```bash
# Using Make
make monitoring

# Without Make
docker-compose -f docker-compose.monitoring.yml up -d
```

Access the monitoring tools:
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (default credentials: admin/admin)

## Database Management

### Backup MongoDB Data

```bash
# Using Make
make backup

# Without Make
mkdir -p ./backups
docker exec mongodb mongodump --username $ROOT_USERNAME --password $ROOT_PASSWORD --authenticationDatabase admin --out /data/db/backup
docker cp mongodb:/data/db/backup ./backups/backup_$(date +%Y%m%d_%H%M%S)
```

### Restore MongoDB Data

```bash
# Using Make
make restore BACKUP_DIR=./backups/backup_20250101_120000

# Without Make
docker cp ./backups/backup_20250101_120000 mongodb:/data/db/backup_to_restore
docker exec mongodb mongorestore --username $ROOT_USERNAME --password $ROOT_PASSWORD --authenticationDatabase admin /data/db/backup_to_restore
```

## CI/CD Integration

The project includes GitHub Actions workflows for CI/CD:

1. Runs tests on pull requests and pushes to main
2. Builds and pushes Docker images to Docker Hub
3. Deploys to production server automatically

Required GitHub Secrets:
- `DOCKERHUB_USERNAME`: Docker Hub username
- `DOCKERHUB_TOKEN`: Docker Hub access token
- `DEPLOY_HOST`: SSH host for deployment
- `DEPLOY_USERNAME`: SSH username
- `DEPLOY_SSH_KEY`: SSH private key
- `JWT_SECRET`: JWT secret for testing
- `SESSION_SECRET`: Session secret for testing

## Troubleshooting

### Common Issues

1. **Container fails to start**
   - Check logs: `docker-compose logs app`
   - Verify environment variables are set correctly
   - Check MongoDB connection: `docker-compose exec mongodb mongosh`

2. **Database authentication issues**
   - Ensure MongoDB credentials match between services
   - For fresh installs, MongoDB needs time to initialize

3. **File permission issues**
   - The logs directory should be writable: `chmod -R 777 logs`

### Checking Container Health

```bash
docker-compose ps
docker inspect horsey-backend | grep Health
```

For more assistance, check the application logs or open an issue on GitHub.
