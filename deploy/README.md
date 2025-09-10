# Deployment Guide

## Quick Start

### Docker Deployment (Recommended)

The simplest way to deploy a Brain app is using Docker:

```bash
# Build and run locally
cd deploy/docker
docker build -t brain-app --build-arg APP_NAME=test-brain ../..
docker run -p 3333:3333 --env-file .env.production brain-app
```

### Using Docker Compose

```bash
cd deploy/docker
cp .env.production.example .env.production
# Edit .env.production with your API keys
docker-compose up -d
```

## Deployment Methods

### 1. Local Docker
```bash
deploy/scripts/deploy-docker.sh test-brain local
```

### 2. Remote Server
```bash
deploy/scripts/deploy-docker.sh test-brain remote user@server.com
```

### 3. Hetzner Cloud
```bash
cd deploy/providers/hetzner
cp config.env.example config.env
# Edit config.env with your Hetzner API token
terraform init
terraform apply
```

## Environment Configuration

Create `.env.production` from the example:

```bash
cp deploy/docker/.env.production.example .env.production
```

Required variables:
- `ANTHROPIC_API_KEY` - For AI features

Optional variables:
- `MATRIX_HOMESERVER` - Matrix server URL
- `MATRIX_USER_ID` - Matrix user ID
- `MATRIX_ACCESS_TOKEN` - Matrix access token
- `PORT` - Server port (default: 3333)

## Directory Structure

```
deploy/
├── docker/               # Docker configuration
│   ├── Dockerfile       # Simple Dockerfile using Bun
│   ├── docker-compose.yml
│   └── .env.production.example
├── providers/           # Cloud provider setups
│   ├── hetzner/        # Hetzner Cloud with Terraform
│   └── docker/         # Generic Docker deployment
└── scripts/            # Deployment scripts
    ├── deploy-docker.sh # Docker deployment
    └── lib/            # Shared script libraries
```

## Requirements

- **Docker**: Version 20.10 or higher
- **Docker Compose**: Version 2.0 or higher
- **Bun**: For local development only
- **Terraform**: For Hetzner deployment only