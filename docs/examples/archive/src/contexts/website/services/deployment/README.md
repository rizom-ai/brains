# Website Deployment Services

This directory contains services for deploying websites in both production and development environments.

## Available Deployment Managers

### 1. LocalCaddyDeploymentManager

The default production deployment manager that uses Caddy server for hosting websites. It manages:

- File operations between preview and production environments
- Checking Caddy server status
- Verifying website accessibility

### 2. LocalDevDeploymentManager

A development-focused deployment manager that uses local directories and simple file operations. It:

- Works with local file system in the project directory
- Supports the same API as the production manager
- Uses simple local paths like `./dist/preview` and `./dist/production`

## How to Use Different Deployment Managers

The appropriate deployment manager is selected automatically based on environment:

1. **In development/test environments**: LocalDevDeploymentManager is used by default
2. **In production environments**: LocalCaddyDeploymentManager is used by default

You can override this with an environment variable:

```bash
# To force using local development manager in any environment
export WEBSITE_DEPLOYMENT_TYPE=local-dev
```

## Local Development Workflow

In development mode:

1. `website-build` - Builds website to `./dist/preview`
2. `website-promote` - Copies files from `./dist/preview` to `./dist/production`
3. `website-status` - Shows status of the preview or production environment

## Production Workflow

In production mode:

1. `website-build` - Builds website to `/opt/personal-brain-website/preview/dist`
2. `website-promote` - Copies files to `/opt/personal-brain-website/production/dist` and reloads Caddy
3. `website-status` - Shows status of the preview or production environment

## Directory Structure

### Development Structure

```
project-root/
  └── dist/
      ├── preview/      # Preview environment
      └── production/   # Production environment
```

### Production Structure

```
/opt/personal-brain-website/
  ├── preview/
  │   └── dist/         # Preview environment
  └── production/
      └── dist/         # Production environment
```