# App Package Plan

## Overview

Create a new `@brains/app` package that provides a high-level, convenience API for building Brain applications. This package will wrap the lower-level `@brains/shell` functionality with sensible defaults and simplified lifecycle management.

## Motivation

Currently, applications need to:
1. Create an MCP server instance
2. Create a transport (HTTP or stdio)
3. Wire them together
4. Create a Shell with the MCP server
5. Initialize the shell
6. Start the transport

This is repetitive boilerplate that could be abstracted for the common case.

## Design Goals

1. **Simple API** - One-line creation for common cases
2. **Convention over Configuration** - Sensible defaults that just work
3. **Preserve Flexibility** - Don't prevent access to underlying components
4. **Clear Abstraction** - App is for applications, Shell is for libraries/advanced use

## Package Structure

```
packages/app/
├── src/
│   ├── index.ts         # Main exports
│   ├── app.ts           # App class implementation
│   ├── types.ts         # TypeScript types
│   └── defaults.ts      # Default configurations
├── test/
│   └── app.test.ts      # Unit tests
├── package.json
├── tsconfig.json
└── README.md
```

## API Design

### Basic Usage

```typescript
import { App } from "@brains/app";

// Simplest case - HTTP server with defaults
const app = await App.create({
  server: "http",
});
await app.start();

// With custom configuration
const app = await App.create({
  server: "http",
  port: 8080,
  database: { url: "file:./my-brain.db" },
  ai: { apiKey: process.env.ANTHROPIC_API_KEY },
  plugins: [gitSync({ repoPath: "./brain-repo" })],
});
await app.start();
```

### App Class Interface

```typescript
interface AppConfig {
  // Server configuration
  server: "http" | "stdio";
  port?: number | string;        // For HTTP server
  host?: string;                 // For HTTP server
  
  // Shell configuration (subset of ShellConfig)
  database?: DatabaseConfig;
  ai?: AIConfig;
  logging?: LoggingConfig;
  plugins?: Plugin[];
  
  // MCP server configuration
  mcpServerName?: string;
  mcpServerVersion?: string;
}

class App {
  // Factory method - creates and initializes everything
  static async create(config: AppConfig): Promise<App>;
  
  // Lifecycle methods
  async start(): Promise<void>;
  async stop(): Promise<void>;
  
  // Access to underlying components (if needed)
  getShell(): Shell;
  getServer(): StreamableHTTPServer | StdioMCPServer;
  getMcpServer(): McpServer;
  
  // Convenience methods
  isRunning(): boolean;
  getPort(): number | undefined;  // For HTTP servers
}
```

### Internal Implementation

```typescript
class App {
  private shell: Shell;
  private transport: StreamableHTTPServer | StdioMCPServer;
  private mcpServer: McpServer;
  
  static async create(config: AppConfig): Promise<App> {
    // 1. Create MCP server
    const mcpServer = new McpServer({
      name: config.mcpServerName ?? "brain-app",
      version: config.mcpServerVersion ?? "1.0.0",
    });
    
    // 2. Create appropriate transport
    let transport;
    if (config.server === "http") {
      transport = new StreamableHTTPServer({
        port: config.port ?? 3333,
        host: config.host ?? "0.0.0.0",
      });
      transport.connectMCPServer(mcpServer);
    } else {
      transport = StdioMCPServer.createFresh({
        name: config.mcpServerName ?? "brain-app",
        version: config.mcpServerVersion ?? "1.0.0",
      });
      // Note: stdio creates its own internal MCP server
      mcpServer = transport.getServer();
    }
    
    // 3. Create shell with sensible defaults
    const shellConfig = {
      database: config.database ?? { url: "file:./brain.db" },
      ai: config.ai ?? {
        provider: "anthropic" as const,
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: "claude-3-haiku-20240307",
      },
      logging: config.logging ?? {
        level: "info" as const,
        context: "brain-app",
      },
      plugins: config.plugins ?? [],
    };
    
    const shell = Shell.createFresh(shellConfig, { mcpServer });
    
    // 4. Initialize shell
    await shell.initialize();
    
    // 5. Create and return App instance
    return new App(shell, transport, mcpServer);
  }
}
```

## Benefits

1. **Simplified Application Code**
   ```typescript
   // Before: 20+ lines of boilerplate
   // After: 3 lines
   const app = await App.create({ server: "http" });
   await app.start();
   ```

2. **Consistent Patterns** - All Brain apps follow the same structure

3. **Better Defaults** - New users get working config without deep knowledge

4. **Gradual Complexity** - Start simple, access internals when needed

## Migration Example

### Before (test-brain current code)
```typescript
const mcpServer = new McpServer({
  name: "test-brain-mcp",
  version: "1.0.0",
});

const httpServer = new StreamableHTTPServer({
  port: process.env["BRAIN_SERVER_PORT"] ?? 3333,
  logger: { /* ... */ },
});

httpServer.connectMCPServer(mcpServer);

const shell = Shell.createFresh({
  database: { /* ... */ },
  ai: { /* ... */ },
  // ... more config
}, { mcpServer });

await shell.initialize();
await httpServer.start();
```

### After (using App)
```typescript
const app = await App.create({
  server: "http",
  port: process.env["BRAIN_SERVER_PORT"] ?? 3333,
  plugins: [gitSync({ repoPath: "/home/yeehaa/Documents/brain" })],
});
await app.start();
```

## Future Enhancements

1. **CLI Integration** - App could provide CLI argument parsing
2. **Graceful Shutdown** - Built-in signal handling
3. **Health Checks** - Standardized health check endpoints
4. **Metrics** - Optional metrics collection
5. **Plugin Marketplace** - Easy plugin discovery and installation

## Implementation Steps

1. Create the `@brains/app` package structure
2. Implement the App class with basic HTTP and stdio support
3. Add comprehensive tests
4. Update test-brain to use App
5. Create examples showing both App and Shell usage
6. Update documentation

## Open Questions

1. **Should App handle process signals automatically?**
   - Could add `handleSignals: boolean` option
   - Would register SIGTERM/SIGINT handlers for graceful shutdown

2. **Should we support programmatic config loading?**
   - Could add `App.createFromFile("config.json")`
   - Or support environment-based config

3. **What about development mode features?**
   - Auto-reload on file changes
   - Development UI
   - Debug logging

These can be addressed in future iterations based on user feedback.