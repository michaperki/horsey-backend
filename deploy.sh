#!/bin/bash

# Load environment variables from .env file
set -a
source .env
set +a

# Pull the latest images
docker-compose pull

# Stop the current containers
docker-compose down

# Start the new containers
docker-compose up -d

# Clean up unused images
docker image prune -f

echo "Deployment completed successfully!"
