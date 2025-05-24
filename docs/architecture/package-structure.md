# Package Structure

## Overview

The Brains repository uses a monorepo structure designed to support multiple brain implementations (personal, team, collective) with shared infrastructure and clear separation of concerns.

## Package Organization

### Core Packages

#### `packages/shell`

- **Purpose**: Core brain infrastructure and business logic
- **Responsibilities**:
  - Entity management (EntityService, EntityRegistry)
  - Schema management (SchemaRegistry)
  - Message bus and messaging system
  - Query processing (QueryProcessor)
  - Brain protocol (command routing)
  - Core types and interfaces
- **Dependencies**: Minimal - only essential libraries (Drizzle, Zod)
- **Consumers**: All other packages depend on shell

#### `packages/mcp-server`

- **Purpose**: Model Context Protocol (MCP) server infrastructure
- **Responsibilities**:
  - MCP standard compliance
  - Provides server infrastructure for tool/resource registration
  - Transport implementations (stdio, HTTP/SSE)
  - Connection lifecycle management
  - Does NOT define specific tools or resources
- **Dependencies**:
  - `@modelcontextprotocol/sdk` only
  - No dependency on shell or other packages
- **Consumers**: Apps that need MCP interface
- **Usage Pattern**: Other packages register their own tools/resources with the MCP server

#### `packages/cli`

- **Purpose**: Command-line interface functionality
- **Responsibilities**:
  - Interactive command parsing
  - CLI-specific formatting and output
  - Command history and completion
  - Direct shell integration (no MCP overhead)
- **Dependencies**:
  - `packages/shell`
  - CLI libraries (e.g., commander, inquirer)
- **Consumers**: Brain app in CLI mode

#### `packages/matrix-bot`

- **Purpose**: Matrix bot functionality
- **Responsibilities**:
  - Matrix protocol handling
  - Message parsing and response formatting
  - Matrix-specific features (rooms, threads, reactions)
  - Direct shell integration
- **Dependencies**:
  - `packages/shell`
  - Matrix SDK
- **Consumers**: Brain app in Matrix mode

### Context Packages (Future)

#### `packages/note-context`

- **Purpose**: Note management context
- **Responsibilities**:
  - Note entity adapter
  - Note-specific operations
  - Note search and indexing
- **Dependencies**: `packages/shell`

#### `packages/task-context`

- **Purpose**: Task management context
- **Responsibilities**:
  - Task entity adapter
  - Task-specific operations
  - Task scheduling and reminders
- **Dependencies**: `packages/shell`

## Multiple Brain Architecture

The repository supports different brain types that share core infrastructure:

### Brain Types

1. **Personal Brain** (`apps/personal-brain`)
   - Individual knowledge management
   - Personal notes, tasks, and projects
   - Private by default

2. **Team Brain** (`apps/team-brain`) - Future
   - Shared team knowledge
   - Collaborative features
   - Permission-based access

3. **Collective Brain** (`apps/collective-brain`) - Future
   - Community knowledge base
   - Public contributions
   - Consensus mechanisms

### Shared vs. Specific Contexts

Some contexts are shared across all brain types:
- `@brains/note-context` - Notes work the same in all brains
- `@brains/task-context` - Tasks have universal structure
- `@brains/project-context` - Projects follow common patterns

Some contexts may be brain-specific:
- `@brains/personal-context` - Personal profiles, preferences
- `@brains/team-context` - Team-specific features
- `@brains/collective-context` - Community governance

## Application Structure

### `apps/personal-brain`

The unified application that can run in multiple modes:

```typescript
// Example usage
personal-brain --mode mcp      // Run as MCP server only
personal-brain --mode cli      // Run as interactive CLI
personal-brain --mode matrix   // Run as Matrix bot
personal-brain --mode all      // Run all services (default)

// Multiple modes
personal-brain --mode mcp,cli  // Run MCP server and CLI
```

**Mode Implementations**:

- Each mode imports and initializes the corresponding package
- Modes can run concurrently (e.g., MCP server + Matrix bot)
- Shared shell instance across all modes
- Graceful shutdown handling for all active modes

## Dependency Graph

```
apps/personal-brain
    ├── packages/mcp-server
    │   └── packages/shell
    ├── packages/cli
    │   └── packages/shell
    ├── packages/matrix-bot
    │   └── packages/shell
    └── packages/shell
        └── (core dependencies)
```

## Design Principles

1. **Single Responsibility**: Each package has one clear purpose
2. **Dependency Direction**: Dependencies flow inward to shell, never outward
3. **Protocol Isolation**: External protocols (MCP, Matrix) isolated in their own packages
4. **Mode Flexibility**: Brain app can run any combination of modes
5. **Shared Core**: All modes use the same shell instance
6. **Inversion of Control**: Infrastructure packages (like MCP) don't define business logic

## Building Executable Applications

### Bun Executable Compilation

Each brain application can be compiled into a standalone executable using Bun:

```bash
# Build personal-brain executable
cd apps/personal-brain
bun build src/index.ts --compile --outfile personal-brain

# Build with optimizations
bun build src/index.ts --compile --outfile personal-brain --minify

# Cross-platform builds
bun build src/index.ts --compile --outfile personal-brain-linux --target=bun-linux-x64
bun build src/index.ts --compile --outfile personal-brain-darwin --target=bun-darwin-x64
```

### Package Scripts

Each app should include build scripts in `package.json`:

```json
{
  "scripts": {
    "build": "bun build src/index.ts --compile --outfile dist/personal-brain",
    "build:prod": "bun build src/index.ts --compile --outfile dist/personal-brain --minify",
    "build:all": "npm run build:linux && npm run build:macos && npm run build:windows",
    "build:linux": "bun build src/index.ts --compile --outfile dist/personal-brain-linux --target=bun-linux-x64",
    "build:macos": "bun build src/index.ts --compile --outfile dist/personal-brain-macos --target=bun-darwin-x64",
    "build:windows": "bun build src/index.ts --compile --outfile dist/personal-brain-windows --target=bun-windows-x64"
  }
}
```

### Distribution

The compiled executables are self-contained and include:
- All application code
- All dependencies
- Bun runtime

No need to install Node.js, Bun, or any dependencies on the target system.

## Benefits

1. **Clean Architecture**: Clear boundaries between concerns
2. **Independent Testing**: Each package can be tested in isolation
3. **Flexible Deployment**: Choose which modes to run based on needs
4. **Easy Maintenance**: Changes to one protocol don't affect others
5. **Reusability**: Packages can be used by other apps if needed
6. **Single Binary Distribution**: Deploy brain apps as single executables

## Migration Path

1. Create `packages/mcp-server` and move MCP implementation
2. Create `packages/cli` and extract CLI functionality
3. Create `packages/matrix-bot` and extract Matrix functionality
4. Update `apps/personal-brain` to support mode selection
5. Add context packages as needed

## Package Interface Standards

All packages should follow these standards:

```typescript
// Each package exports a standard interface
export interface PackageRunner {
  name: string;
  initialize(shell: Shell): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): PackageStatus;
}

// Example implementation
export class MCPServerRunner implements PackageRunner {
  name = "mcp-server";

  async initialize(shell: Shell): Promise<void> {
    // Setup using shell instance
  }

  async start(): Promise<void> {
    // Start the service
  }

  async stop(): Promise<void> {
    // Graceful shutdown
  }

  getStatus(): PackageStatus {
    // Return current status
  }
}
```

This ensures all packages can be managed consistently by the personal-brain app.

## MCP Registration Pattern

The MCP server package provides infrastructure without defining specific tools or resources. Other packages register their capabilities:

```typescript
// In apps/personal-brain when MCP mode is enabled
import { MCPServer } from "@brains/mcp-server";
import { Shell } from "@brains/shell";

// Create MCP server with just the infrastructure
const mcpServer = MCPServer.createFresh({
  name: "PersonalBrain",
  version: "1.0.0",
});

// Get the underlying server for registration
const server = mcpServer.getServer();

// Shell registers its core tools
Shell.registerMCPTools(server);
Shell.registerMCPResources(server);

// Contexts register their specific tools
noteContext.registerMCPTools(server);
taskContext.registerMCPTools(server);

// Start the server
await mcpServer.startStdio();
```

This pattern ensures:

- MCP server has no knowledge of specific business logic
- Each package owns its tool/resource definitions
- Clean separation between infrastructure and implementation
- Easy to add/remove capabilities without modifying MCP server
