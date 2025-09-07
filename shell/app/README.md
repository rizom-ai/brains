# @brains/app

Application orchestration and lifecycle management for Personal Brain applications.

## Overview

The app package provides the core application framework for running Brain applications. It handles initialization, plugin loading, database setup, and interface management.

## Features

- **Astro-style Configuration**: Simple defineConfig pattern for app setup
- **Automatic Plugin Loading**: Discovers and loads plugins based on configuration
- **Database Management**: Handles database initialization and migrations
- **Interface Management**: Supports multiple interfaces (CLI, Matrix, MCP)
- **Environment Configuration**: Loads configuration from .env files

## Usage

### Basic Application

```typescript
import { defineConfig } from "@brains/app";

export default defineConfig({
  name: "my-brain",
  version: "1.0.0",
  plugins: [
    // Your plugins here
  ],
});
```

### Running the Application

```typescript
import { handleCLI } from "@brains/app";
import config from "./brain.config";

await handleCLI(config);
```

### With Custom Configuration

```typescript
import { App } from "@brains/app";

const app = new App({
  name: "my-brain",
  version: "1.0.0",
  database: {
    entities: "./data/brain.db",
    jobQueue: "./data/jobs.db",
    conversations: "./data/conversations.db",
  },
  plugins: [...],
  interfaces: ["cli", "matrix", "mcp"],
});

await app.initialize();
await app.start();
```

## CLI Commands

The app package provides built-in CLI commands:

- `--cli` - Start with CLI interface
- `--matrix` - Start with Matrix bot interface
- `--mcp` - Start as MCP server (default)
- `--migrate` - Run database migrations
- `--version` - Show version information

## Database Migrations

The app package handles migrations for all three databases:

```bash
# Run all migrations
bun run migrate

# Run specific migrations
bun run migrate:entities
bun run migrate:jobs
bun run migrate:conversations
```

## Environment Variables

Configure your app through environment variables:

```env
# Database paths
DATABASE_URL=file:./data/brain.db
JOB_QUEUE_DATABASE_URL=file:./data/jobs.db
CONVERSATION_DATABASE_URL=file:./data/conversations.db

# Interface configuration
MATRIX_HOMESERVER=https://matrix.org
MATRIX_USER_ID=@bot:matrix.org
MATRIX_ACCESS_TOKEN=your_token

# AI Services
ANTHROPIC_API_KEY=your_api_key
```

## Plugin Loading

Plugins are loaded in dependency order and initialized with the shell context:

1. Core plugins (system, directory-sync, git-sync)
2. Service plugins (link, topics, summary, site-builder)
3. Interface plugins (mcp, cli, matrix, webserver)

## API

### defineConfig(config)

Creates an application configuration object.

### handleCLI(config)

Handles command-line arguments and starts the appropriate interface.

### App class

Main application class that manages the entire lifecycle:

- `initialize()` - Set up databases and load plugins
- `start()` - Start the selected interface
- `stop()` - Graceful shutdown
