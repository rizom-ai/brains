# App Integration Guide

This guide explains how to integrate the various packages into a complete Personal Brain application.

## Overview

The main application will:

1. Initialize the skeleton core
2. Register context plugins
3. Start the MCP server
4. Set up interface adapters (CLI and Matrix)

## Creating the Main App Package

First, let's set up the main application package:

```bash
mkdir -p apps/personal-brain/src
cd apps/personal-brain
```

### Configure Package.json

```json
{
  "name": "@personal-brain/app",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "bin": {
    "brain": "./dist/index.js"
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "dev": "tsup src/index.ts --format esm --dts --watch",
    "lint": "eslint \"src/**/*.ts\"",
    "typecheck": "tsc --noEmit",
    "test": "bun test",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@personal-brain/skeleton": "workspace:*",
    "@personal-brain/note-context": "workspace:*",
    "@personal-brain/profile-context": "workspace:*",
    "@personal-brain/website-context": "workspace:*",
    "@personal-brain/conversation-context": "workspace:*",
    "@personal-brain/cli": "workspace:*",
    "@personal-brain/matrix-bot": "workspace:*"
  },
  "devDependencies": {
    "@personal-brain/eslint-config": "workspace:*",
    "@personal-brain/typescript-config": "workspace:*",
    "@types/node": "^18.16.0",
    "eslint": "^8.48.0",
    "tsup": "^7.2.0",
    "typescript": "^5.2.2"
  }
}
```

### Configure TypeScript

```json
{
  "extends": "@personal-brain/typescript-config/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

## Main Application Structure

Create the following files:

### src/index.ts

This is the main entry point for the application:

```typescript
#!/usr/bin/env node
import { AppFactory } from "./app";

// Parse command line arguments
const args = process.argv.slice(2);
const debug = args.includes("--debug");

// Create the application
const app = AppFactory.create({
  debug,
  dbPath: process.env.DB_PATH || "./brain.db",
  matrixEnabled: process.env.MATRIX_ENABLED === "true",
});

// Start the application
app.start().catch((error) => {
  console.error("Failed to start application:", error);
  process.exit(1);
});
```

### src/app.ts

This file contains the main application class:

```typescript
import {
  Registry,
  Logger,
  createDB,
  runMigrations,
  PluginManager,
  MCPServer,
} from "@personal-brain/skeleton";

// Import contexts
import { registerNoteContext } from "@personal-brain/note-context";
import { registerProfileContext } from "@personal-brain/profile-context";
import { registerWebsiteContext } from "@personal-brain/website-context";
import { registerConversationContext } from "@personal-brain/conversation-context";

// Import interfaces
import { registerCLI } from "@personal-brain/cli";
import { registerMatrix } from "@personal-brain/matrix-bot";

/**
 * App configuration
 */
export interface AppConfig {
  debug: boolean;
  dbPath: string;
  matrixEnabled: boolean;
}

/**
 * Main application class
 */
export class App {
  private registry: Registry;
  private logger: Logger;
  private pluginManager: PluginManager;
  private mcpServer: MCPServer;
  private config: AppConfig;

  /**
   * Create a new application instance
   */
  constructor(config: AppConfig) {
    this.config = config;

    // Create logger
    this.logger = new Logger({
      level: config.debug ? "debug" : "info",
    });

    // Create registry
    this.registry = new Registry();

    // Register logger
    this.registry.register("logger", () => this.logger);

    // Create plugin manager
    this.pluginManager = new PluginManager(this.createPluginContext());

    // Create MCP server
    this.mcpServer = new MCPServer(
      this.registry,
      this.pluginManager,
      this.logger,
    );
  }

  /**
   * Start the application
   */
  async start(): Promise<void> {
    // Initialize database
    this.logger.info("Initializing database");
    const db = createDB(this.config.dbPath);

    // Register database
    this.registry.register("db", () => db);

    // Run migrations
    await runMigrations(this.config.dbPath, this.logger);

    // Register plugins
    this.registerPlugins();

    // Initialize plugins
    this.logger.info("Initializing plugins");
    await this.pluginManager.initializePlugins();

    // Start MCP server
    this.logger.info("Starting MCP server");
    await this.mcpServer.start({
      port: 3000,
      enableStdio: true,
    });

    this.logger.info("Application started");
  }

  /**
   * Stop the application
   */
  async stop(): Promise<void> {
    this.logger.info("Stopping application");

    // Stop MCP server
    await this.mcpServer.stop();

    // Shutdown plugins
    await this.pluginManager.shutdownPlugins();

    this.logger.info("Application stopped");
  }

  /**
   * Register all plugins
   */
  private registerPlugins(): void {
    // Register core contexts
    this.pluginManager.registerPlugin(registerNoteContext());
    this.pluginManager.registerPlugin(registerProfileContext());
    this.pluginManager.registerPlugin(registerWebsiteContext());
    this.pluginManager.registerPlugin(registerConversationContext());

    // Register interfaces
    this.pluginManager.registerPlugin(registerCLI());

    // Register Matrix if enabled
    if (this.config.matrixEnabled) {
      this.pluginManager.registerPlugin(registerMatrix());
    }
  }

  /**
   * Create plugin context
   */
  private createPluginContext() {
    return {
      registry: this.registry,
      logger: this.logger,
    };
  }
}

/**
 * App factory
 */
export class AppFactory {
  /**
   * Create a new application
   */
  static create(config: AppConfig): App {
    return new App(config);
  }
}
```

## Interface Integration

### CLI Interface

The CLI interface needs to register a plugin that connects to the MCP server:

```typescript
// @personal-brain/cli/src/index.ts
import {
  ContextPlugin,
  PluginContext,
  PluginLifecycle,
} from "@personal-brain/skeleton";
import { CLIAdapter } from "./cliAdapter";

/**
 * Register CLI interface
 */
export function registerCLI(): ContextPlugin {
  return {
    id: "cli-interface",
    version: "1.0.0",
    dependencies: ["note-context", "profile-context"],

    register(context: PluginContext): PluginLifecycle {
      const { registry, logger } = context;

      // Create CLI adapter
      const cliAdapter = new CLIAdapter(registry, logger);

      // Register CLI adapter
      registry.register("cliAdapter", () => cliAdapter);

      return {
        async onInitialize() {
          logger.info("Initializing CLI interface");

          // Initialize CLI adapter
          await cliAdapter.initialize();
        },

        async onShutdown() {
          logger.info("Shutting down CLI interface");

          // Shutdown CLI adapter
          await cliAdapter.shutdown();
        },
      };
    },
  };
}
```

### Matrix Interface

Similarly, the Matrix interface registers a plugin:

```typescript
// @personal-brain/matrix-bot/src/index.ts
import {
  ContextPlugin,
  PluginContext,
  PluginLifecycle,
} from "@personal-brain/skeleton";
import { MatrixAdapter } from "./matrixAdapter";

/**
 * Register Matrix interface
 */
export function registerMatrix(): ContextPlugin {
  return {
    id: "matrix-interface",
    version: "1.0.0",
    dependencies: ["note-context", "profile-context"],

    register(context: PluginContext): PluginLifecycle {
      const { registry, logger } = context;

      // Create Matrix adapter
      const matrixAdapter = new MatrixAdapter(registry, logger);

      // Register Matrix adapter
      registry.register("matrixAdapter", () => matrixAdapter);

      return {
        async onInitialize() {
          logger.info("Initializing Matrix interface");

          // Initialize Matrix adapter with environment variables
          await matrixAdapter.initialize({
            homeserver: process.env.MATRIX_HOMESERVER!,
            userId: process.env.MATRIX_USER_ID!,
            accessToken: process.env.MATRIX_ACCESS_TOKEN!,
          });
        },

        async onShutdown() {
          logger.info("Shutting down Matrix interface");

          // Shutdown Matrix adapter
          await matrixAdapter.shutdown();
        },
      };
    },
  };
}
```

## Environment Configuration

Create a `.env` file for configuration:

```
# Database
DB_PATH=./brain.db

# Debug mode
DEBUG=false

# Matrix integration
MATRIX_ENABLED=false
MATRIX_HOMESERVER=https://matrix.org
MATRIX_USER_ID=@your-bot:matrix.org
MATRIX_ACCESS_TOKEN=your-access-token

# AI services
ANTHROPIC_API_KEY=your-anthropic-api-key
OPENAI_API_KEY=your-openai-api-key
```

Create an environment loading utility:

```typescript
// src/config.ts
import { config } from "dotenv";
import { z } from "zod";

// Load environment variables
config();

// Environment schema
const envSchema = z.object({
  // Database
  DB_PATH: z.string().default("./brain.db"),

  // Debug mode
  DEBUG: z
    .string()
    .transform((v) => v === "true")
    .default("false"),

  // Matrix integration
  MATRIX_ENABLED: z
    .string()
    .transform((v) => v === "true")
    .default("false"),
  MATRIX_HOMESERVER: z.string().optional(),
  MATRIX_USER_ID: z.string().optional(),
  MATRIX_ACCESS_TOKEN: z.string().optional(),

  // AI services
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
});

// Parse environment variables
export const env = envSchema.parse(process.env);
```

## Building the Application

The final step is to build the application:

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run the application
node ./apps/personal-brain/dist/index.js
```

## Distribution

To create a distributable version of the application:

```bash
# Create executable
pnpm --filter "@personal-brain/app" build

# Create package
cd apps/personal-brain
npm pack
```

This will create a tarball that can be installed globally:

```bash
npm install -g personal-brain-0.0.0.tgz
```

## Docker Support

Create a `Dockerfile` for containerized deployment:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy all packages
COPY packages ./packages
COPY apps ./apps

# Install dependencies
RUN npm install -g pnpm
RUN pnpm install

# Build all packages
RUN pnpm build

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV DB_PATH=/data/brain.db

# Create volume for data
VOLUME /data

# Run the application
CMD ["node", "./apps/personal-brain/dist/index.js"]
```

Build and run the Docker image:

```bash
# Build image
docker build -t personal-brain .

# Run container
docker run -p 3000:3000 -v ./data:/data personal-brain
```

## Development Workflow

During development, you can use the `dev` script to watch for changes:

```bash
# Start development mode
pnpm dev

# In another terminal, run the app
node ./apps/personal-brain/dist/index.js
```

This will rebuild all packages when files change, allowing for rapid iteration.

## Testing

Run tests for all packages:

```bash
pnpm test
```

Or test a specific package:

```bash
pnpm --filter "@personal-brain/note-context" test
```

## Integration Testing

Create integration tests that verify the entire application works together:

```typescript
// apps/personal-brain/test/integration.test.ts
import { AppFactory } from "../src/app";

describe("Application Integration", () => {
  let app;

  beforeEach(async () => {
    // Create app with in-memory database
    app = AppFactory.create({
      debug: true,
      dbPath: ":memory:",
      matrixEnabled: false,
    });

    // Start app
    await app.start();
  });

  afterEach(async () => {
    // Stop app
    await app.stop();
  });

  test("should create and retrieve a note", async () => {
    // Get MCP server
    const mcpServer = app.getMcpServer();

    // Create a note message
    const createNoteMessage = {
      id: "test-message-id",
      tool_calls: [
        {
          name: "create-note",
          arguments: {
            title: "Test Note",
            content: "This is a test note",
            tags: ["test"],
          },
        },
      ],
    };

    // Send message to MCP server
    const createResponse = await mcpServer.handleMessage(createNoteMessage);

    // Verify response
    expect(createResponse.success).toBe(true);
    expect(createResponse.result).toHaveProperty("id");

    // Get note ID
    const noteId = createResponse.result.id;

    // Create get note message
    const getNoteMessage = {
      id: "test-message-id-2",
      tool_calls: [
        {
          name: "get-note",
          arguments: {
            id: noteId,
          },
        },
      ],
    };

    // Send message to MCP server
    const getResponse = await mcpServer.handleMessage(getNoteMessage);

    // Verify response
    expect(getResponse.success).toBe(true);
    expect(getResponse.result.id).toBe(noteId);
    expect(getResponse.result.title).toBe("Test Note");
    expect(getResponse.result.content).toBe("This is a test note");
  });
});
```
