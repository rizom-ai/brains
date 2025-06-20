# Rizom Collective Brain Deployment Plan

## Overview

Create a minimal teaser deployment of the Personal Brain for the Rizom collective featuring:

1. **Directory Sync** - Flexible markdown content management
2. **Matrix Interface** - Answer questions in Matrix chat rooms
3. **Landing Page** - Generate and serve a landing page for Rizom

## Application Structure

### Create Rizom Brain App

```
apps/rizom-brain/
├── src/
│   └── index.ts        # Main app entry
├── brain-data/         # Empty - users add content as needed
├── package.json
├── tsconfig.json
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

### Main Application Code

```typescript
// apps/rizom-brain/src/index.ts
import { App, getMatrixInterfaceFromEnv } from "@brains/app";
import { directorySync } from "@brains/directory-sync";
import { webserverPlugin } from "@brains/webserver-plugin";

async function main(): Promise<void> {
  const matrixInterface = getMatrixInterfaceFromEnv();

  await App.run({
    name: "rizom-brain",
    version: "1.0.0",
    transport: {
      type: "http",
      port: Number(process.env["BRAIN_SERVER_PORT"] ?? 3333),
      host: "0.0.0.0", // Listen on all interfaces for Docker
    },
    database: process.env["DATABASE_URL"] ?? "file:./data/rizom-brain.db",
    aiApiKey: process.env["ANTHROPIC_API_KEY"],
    logLevel: process.env["LOG_LEVEL"] ?? "info",
    interfaces: [...(matrixInterface ? [matrixInterface] : [])],
    plugins: [
      // Directory sync for local markdown storage
      directorySync({
        syncPath: process.env["SYNC_PATH"] ?? "./brain-data",
        watchEnabled: true,
        watchInterval: 5000,
      }),

      // Webserver for landing page
      webserverPlugin({
        outputDir: process.env["WEBSITE_OUTPUT_DIR"] ?? "./site",
        siteTitle: process.env["WEBSITE_TITLE"] ?? "Rizom Collective",
        siteDescription:
          process.env["WEBSITE_DESCRIPTION"] ??
          "Decentralized collective intelligence",
        siteUrl: process.env["WEBSITE_URL"],
        previewPort: 4321,
        productionPort: Number(process.env["WEBSITE_PORT"] ?? 8080),
      }),
    ],
  });
}

main().catch((error) => {
  console.error("Failed to start Rizom Brain:", error);
  process.exit(1);
});
```

## Configuration Files

### Environment Variables (.env.example)

```bash
# Core Configuration
BRAIN_SERVER_PORT=3333
DATABASE_URL=file:./data/rizom-brain.db
ANTHROPIC_API_KEY=your-api-key-here
LOG_LEVEL=info

# Matrix Configuration (optional)
MATRIX_HOMESERVER=https://matrix.org
MATRIX_USER_ID=@rizom-brain:matrix.org
MATRIX_PASSWORD=secure-password
MATRIX_DEVICE_ID=RIZOMBRAIN01
MATRIX_ANCHOR_USER=@your-admin:matrix.org
MATRIX_AUTO_JOIN=true

# Website Configuration
WEBSITE_OUTPUT_DIR=./site
WEBSITE_TITLE=Rizom Collective
WEBSITE_DESCRIPTION=Your description here
WEBSITE_URL=https://brain.rizom.io
WEBSITE_PORT=8080

# Directory sync path
SYNC_PATH=./brain-data
```

### Docker Configuration

```dockerfile
# apps/rizom-brain/Dockerfile
FROM oven/bun:1.1.38-debian

WORKDIR /app

# Copy workspace files
COPY package.json bun.lockb ./
COPY packages packages/
COPY apps/rizom-brain apps/rizom-brain/

# Install dependencies
RUN bun install --frozen-lockfile

# Build the app
RUN bun run build

# Create data directories
RUN mkdir -p /app/data /app/brain-data /app/site

# Expose ports
EXPOSE 3333 8080

# Run the app
CMD ["bun", "run", "apps/rizom-brain/src/index.ts"]
```

### Docker Compose

```yaml
# apps/rizom-brain/docker-compose.yml
version: "3.8"

services:
  rizom-brain:
    build:
      context: ../..
      dockerfile: apps/rizom-brain/Dockerfile
    ports:
      - "3333:3333" # MCP server
      - "8080:8080" # Landing page
    volumes:
      - rizom-data:/app/data
      - ./brain-data:/app/brain-data # Mount local brain-data for easy editing
      - rizom-site:/app/site
    env_file:
      - .env
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3333/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  rizom-data:
  rizom-site:
```

### Package.json

```json
{
  "name": "@brains/rizom-brain",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "bun run src/index.ts",
    "start": "bun run src/index.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@brains/app": "workspace:*",
    "@brains/directory-sync": "workspace:*",
    "@brains/webserver-plugin": "workspace:*"
  },
  "devDependencies": {
    "@brains/typescript-config": "workspace:*",
    "@types/bun": "latest",
    "typescript": "^5.7.3"
  }
}
```

### README.md

````markdown
# Rizom Brain

A minimal Personal Brain deployment for the Rizom collective.

## Features

- **Flexible Content**: Add any markdown files to `brain-data/` - no predetermined structure
- **Matrix Bot**: Answers questions based on your content
- **Landing Page**: Auto-generated website from your content

## Quick Start

1. Copy `.env.example` to `.env` and configure
2. Add markdown files to `brain-data/`
3. Run with Docker:
   ```bash
   docker-compose up -d
   ```
````

## Adding Content

Simply add markdown files to the `brain-data/` directory. The system will:

- Automatically detect and import them
- Make them searchable via Matrix
- Use them for website generation

Example:

```markdown
---
title: Your Title
tags: [any, tags, you, want]
---

# Your Content

Write anything here. No structure required.
```

## Accessing Services

- **MCP API**: http://localhost:3333
- **Website**: http://localhost:8080
- **Matrix Bot**: Message the bot in any allowed room

## Content Ideas

- Project descriptions
- Meeting notes
- Ideas and proposals
- Resource lists
- Guides and tutorials
- Anything in markdown format

````

## Deployment Steps

### 1. Create the App
```bash
# In your brains repository
cd apps
mkdir rizom-brain
cd rizom-brain

# Create structure
mkdir src brain-data
touch src/index.ts package.json tsconfig.json
touch Dockerfile docker-compose.yml .env.example README.md

# Copy from plan above
````

### 2. Local Testing

```bash
# Install dependencies
bun install

# Create .env from .env.example
cp .env.example .env
# Edit .env with your values

# Add any markdown files to brain-data/
echo "# Welcome to Rizom Brain" > brain-data/welcome.md

# Run locally
bun run dev
```

### 3. Deploy with Docker

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Add content by editing files in brain-data/
# Changes are automatically synced
```

### 4. Generate Website

After adding content, generate the website:

```bash
# Generate content
curl -X POST http://localhost:3333/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/call", "params": {"name": "webserver:generate", "arguments": {}}, "id": 1}'

# Build and serve
curl -X POST http://localhost:3333/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/call", "params": {"name": "webserver:build", "arguments": {"environment": "production", "serve": true}}, "id": 2}'
```

## Key Principles

1. **No predetermined entity structure** - just markdown files
2. **Flexible content** - users decide what to add
3. **Simple deployment** - one docker-compose command
4. **Easy content management** - just edit markdown files
5. **All features available** - Matrix bot, website, API

This gives Rizom collective complete freedom to structure their knowledge base however they want.
