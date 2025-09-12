# @brains/app

Application orchestration and lifecycle management for Personal Brain applications.

## Overview

The app package provides the core application framework for running Brain applications. It handles initialization, plugin loading, database setup, and interface management.

## Architecture

The app package follows a modular architecture with clear separation of concerns:

```
App (Main orchestrator)
├── MigrationManager (Database migrations)
├── SeedDataManager (Initial data setup)
└── Shell (Plugin & service management)
    ├── Plugins
    ├── Services
    └── Interfaces
```

### Initialization Flow

1. **Migrations**: Run database migrations for all three databases
2. **Seed Data**: Copy seed content if brain-data is empty
3. **Shell Creation**: Initialize the Shell with configuration
4. **Plugin Loading**: Register and initialize plugins
5. **Interface Startup**: Start the selected interface (CLI/Matrix/MCP)

## Features

- **Astro-style Configuration**: Simple defineConfig pattern for app setup
- **Automatic Plugin Loading**: Discovers and loads plugins based on configuration
- **Database Management**: Handles database initialization and migrations via MigrationManager
- **Seed Data Management**: Automatically copies seed content on first run via SeedDataManager
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
import { DirectorySyncPlugin } from "@brains/directory-sync";
import { LinkPlugin } from "@brains/link";

const app = App.create({
  name: "my-brain",
  version: "1.0.0",
  database: "file:./data/brain.db",
  aiApiKey: process.env.ANTHROPIC_API_KEY,
  plugins: [new DirectorySyncPlugin(), new LinkPlugin()],
});

await app.initialize();
await app.start();
```

### Complete Example with Error Handling

```typescript
import { App, defineConfig } from "@brains/app";

const config = defineConfig({
  name: "personal-brain",
  version: "2.0.0",
  logLevel: "info",
});

try {
  await App.run(config);
} catch (error) {
  console.error("Failed to start:", error);
  process.exit(1);
}
```

## CLI Commands

The app package provides built-in CLI commands:

- `--cli` - Start with CLI interface
- `--matrix` - Start with Matrix bot interface
- `--mcp` - Start as MCP server (default)
- `--migrate` - Run database migrations
- `--version` - Show version information

## Database Migrations

Migrations are handled automatically on startup via the `MigrationManager` class. It manages migrations for all three databases:

- Entity database (`brain.db`)
- Job queue database (`brain-jobs.db`)
- Conversation database (`conversations.db`)

Migrations run automatically when you start the app, but you can also run them manually:

```bash
# Run all migrations
bun run migrate

# Run specific migrations
bun run migrate:entities
bun run migrate:jobs
bun run migrate:conversations
```

## Seed Data

The `SeedDataManager` automatically initializes your brain-data directory with seed content on first run:

1. Checks if `brain-data/` directory exists and is empty
2. If empty, copies content from `seed-content/` directory
3. Creates the directory structure if it doesn't exist

This ensures new installations have example content to work with.

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

- `create(config, shell?)` - Factory method to create an App instance
- `initialize()` - Run migrations, seed data, and load plugins
- `start()` - Start the application and set up signal handlers
- `stop()` - Graceful shutdown
- `run()` - Convenience method that handles full lifecycle
- `getShell()` - Access the underlying Shell instance

### SeedDataManager class

Manages initial data setup for new installations:

```typescript
import { SeedDataManager } from "@brains/app";

const manager = new SeedDataManager(
  logger,
  "/path/to/brain-data", // optional, defaults to ./brain-data
  "/path/to/seed-content", // optional, defaults to ./seed-content
);

await manager.initialize();
```

### MigrationManager class

Handles database migrations:

```typescript
import { MigrationManager } from "@brains/app";

const manager = new MigrationManager(logger);
await manager.runAllMigrations();
```

## Configuration Options

### AppConfig Interface

```typescript
interface AppConfig {
  // Required
  name: string; // Application name
  version: string; // Application version

  // Optional
  database?: string; // Database URL or path
  aiApiKey?: string; // Anthropic API key
  logLevel?: "debug" | "info" | "warn" | "error";
  plugins?: Plugin[]; // Array of plugin instances

  // Advanced (usually not needed)
  shellConfig?: ShellConfig; // Direct Shell configuration
  permissions?: PermissionConfig;
  cliConfig?: CLIConfig;
}
```

### Configuration Precedence

1. Explicit configuration in code
2. Environment variables
3. Default values

### Common Configurations

```typescript
// Minimal configuration
defineConfig({
  name: "my-brain",
  version: "1.0.0",
});

// Development configuration
defineConfig({
  name: "dev-brain",
  version: "1.0.0",
  logLevel: "debug",
  database: "file:./dev-data/brain.db",
});

// Production configuration
defineConfig({
  name: "prod-brain",
  version: "1.0.0",
  logLevel: "warn",
  database: process.env.DATABASE_URL,
  aiApiKey: process.env.ANTHROPIC_API_KEY,
});
```
