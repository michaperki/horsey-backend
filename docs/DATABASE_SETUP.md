# Database Environment Setup Guide

This guide explains how our application uses separate MongoDB databases for different environments to ensure proper isolation between development, testing, and production data.

## Overview

Our application now supports the following separate database environments:

1. **Development** - For local development work
2. **Test** - For automated Jest tests
3. **Cypress** - For Cypress E2E testing 
4. **Production** - For the main production deployment
5. **Netlify** - Specifically for the Netlify deployment

Each environment connects to its own isolated database, preventing data pollution between environments.

## Environment Variables

The separation is achieved through environment-specific `.env` files:

- `.env` - Local development
- `.env.test` - Jest tests
- `.env.cypress` - Cypress tests
- `.env.production` - Production environments (including Netlify)

Each file should have the appropriate `MONGODB_URI_XXX` variable defined:

```
MONGODB_URI_DEV=mongodb://localhost:27017/horsey-dev
MONGODB_URI_TEST=mongodb://localhost:27017/horsey-test
MONGODB_URI_CYPRESS=mongodb://localhost:27017/horsey-cypress
MONGODB_URI_PROD=mongodb://[username]:[password]@[host]:[port]/horsey-prod
MONGODB_URI_NETLIFY=mongodb://[username]:[password]@[host]:[port]/horsey-netlify
```

The application will automatically select the correct database URI based on the `NODE_ENV` environment variable and deployment platform.

## Initial Setup

To initialize all the databases with the correct structure and initial admin users:

```bash
# Run the database initialization script
npm run init-db
```

This script will:

1. Create all necessary databases if they don't exist
2. Create an admin user in each database
3. Set up proper indexes for optimal performance

## Running Different Environments

Use the following npm scripts to run the application in different environments:

```bash
# Development (default database)
npm run dev

# Production database locally
npm run prod

# Cypress testing
npm run cypress

# Jest tests
npm run test

# For Windows systems, use the :win versions
npm run dev:win
npm run prod:win
npm run cypress:win
npm run test:win
```

## How It Works

1. The `NODE_ENV` environment variable determines which `.env` file is loaded
2. The config system in `config/index.js` selects the appropriate database URI
3. For production environments, it also checks for Netlify-specific environment variables

## Deployment Considerations

### Netlify (Prod)

For Netlify deployments, make sure the following environment variables are set in the Netlify dashboard:

- `NODE_ENV=production`
- `NETLIFY=true` (automatically set by Netlify)
- `MONGODB_URI_PROD=mongodb://[username]:[password]@[host]:[port]/horsey-netlify`

## Troubleshooting

If you encounter database connection issues:

1. Check that your `.env` files have the correct MongoDB URIs
2. Verify that MongoDB is running
3. Check the server logs for specific connection errors
4. Ensure you're using the correct npm script for your intended environment

## Adding More Environments

To add another environment (e.g., staging):

1. Create a new `.env.staging` file
2. Add `MONGODB_URI_STAGING` to the file
3. Update `config/index.js` to handle the new environment
4. Add an npm script for the new environment

## Migrating Data Between Environments

To migrate data from one environment to another, you can use MongoDB's import/export tools:

```bash
# Export data from development
mongodump --uri="mongodb://localhost:27017/horsey-dev" --out=./dump

# Import to another environment
mongorestore --uri="mongodb://localhost:27017/horsey-prod" ./dump/horsey-dev
```

For production databases with authentication, you'll need to include credentials in the URI.
