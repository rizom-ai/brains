# Architecture Overview

The Personal Brain application features a modular, plugin-based architecture built around a core shell that provides essential infrastructure for knowledge management.

## Core Architecture Principles

1. **MCP-First Design**: Every brain application is an MCP server, exposing all functionality through the Model Context Protocol
2. **Tool-First Architecture**: All functionality is exposed as self-describing tools with schemas; commands are generated from tools
3. **Monolithic Shell with Plugin Support**: Core functionality lives in the shell package, with plugin interfaces for extensibility
4. **Functional Entity Model**: Uses factory functions and Zod schemas for entity creation, not classes
5. **Schema-First Design**: All data structures use Zod schemas for validation and type safety
6. **Component Interface Standardization**: Consistent singleton pattern across all major components
7. **Behavioral Testing**: Focus on testing behavior rather than implementation details

## Current Implementation State

The codebase follows a 4-directory monorepo structure:

### Shell Packages (Core Infrastructure)

- **shell/core**: Central shell with plugin management and core infrastructure (~1,900 lines, reduced from ~3,400)
- **shell/ai-service**: AI text and object generation using Anthropic
- **shell/app**: Application initialization and lifecycle management
- **shell/content-generator**: Template-based content generation system
- **shell/db**: Database layer with Drizzle ORM and vector support
- **shell/embedding-service**: Text embeddings via FastEmbed
- **shell/entity-service**: Entity CRUD operations and search
- **shell/job-queue**: Background job processing system
- **shell/messaging-service**: Event-driven messaging with pub/sub
- **shell/service-registry**: Component registration and dependency injection
- **shell/view-registry**: Route and template management for views
- **shell/integration-tests**: Cross-package integration testing

### Shared Packages (Cross-Cutting Concerns)

- **shared/types**: Core type definitions (entities, templates, schemas)
- **shared/utils**: Common utilities (logging, markdown, permissions)
- **shared/plugin-utils**: Base classes for plugin development
- **shared/message-interface**: Base classes for message-based interfaces
- **shared/content-management**: Content operations and management
- **shared/daemon-registry**: Long-running process management
- **shared/default-site-content**: Default templates and formatters
- **shared/test-utils**: Testing utilities and harnesses
- **shared/ui-library**: Shared UI components (Ink-based)
- **shared/eslint-config**: Shared ESLint configuration
- **shared/typescript-config**: Shared TypeScript configuration

### Interface Packages (User Interfaces)

- **interfaces/cli**: Command-line interface (MessageInterfacePlugin)
- **interfaces/matrix**: Matrix bot interface (MessageInterfacePlugin)
- **interfaces/matrix-setup**: Matrix account setup utility
- **interfaces/mcp**: MCP interface plugin (InterfacePlugin)
- **interfaces/mcp-server**: MCP server implementations (stdio, HTTP)
- **interfaces/webserver**: Static site server (InterfacePlugin)

### Plugin Packages (Feature Extensions)

- **plugins/directory-sync**: File-based entity synchronization
- **plugins/git-sync**: Version control integration
- **plugins/site-builder**: Static site generation with Preact

### Application Packages

- **apps/test-brain**: Reference implementation and testing

See [Package Structure](./architecture/package-structure.md) for detailed information.

## Key Components

### 1. Shell Core (shell/core)

The shell provides the core infrastructure and extension points for plugins:

**Core Infrastructure:**

- **MCP Server**: Always-on Model Context Protocol server for exposing tools and resources
- **Registry System**: Component registration and dependency injection
- **Plugin Manager**: Manages plugin lifecycles and dependencies
- **Entity Framework**: Base entity types, registry, and adapters
- **Database Layer**: SQLite with vector support (384 dimensions)
- **AI Services**: Local embeddings (FastEmbed) and chat (Anthropic)
- **Query Processor**: Natural language query handling
- **Messaging System**: Pub/sub message passing between components

**Plugin Types:**

- **Entity Plugins**: Domain-specific functionality (Note, Task, Profile)
- **Feature Plugins**: Additional capabilities (git-sync, backup, import/export)
- **Interface Plugins**: Alternative access methods (web-server, GraphQL)

**Interface Architecture:**

Multiple ways to interact with the brain:

- **MCP Server** (built into shell): Always-on interface for MCP clients
- **Interface Plugins**: Web server, GraphQL server (run in-process)
- **External Interfaces**: CLI, Matrix bot (connect via MCP)
- **Unified app with entry router**: Single deployable that can run different modes

```
              Interface Clients
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│     CLI     │  │ Matrix Bot  │  │   Web UI    │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                 │                 │
       └─────────────────┼─────────────────┘
                         │
                   MCP Protocol
                         │
┌─────────────────────────────────────────────────┐
│              Brain Application                  │
│  ┌───────────────────────────────────────────┐  │
│  │         MCP Server (Always On)            │  │
│  │  • Exposes all tools and resources        │  │
│  │  • Handles client connections              │  │
│  │  • Routes to Shell Core                   │  │
│  └────────────────┬──────────────────────────┘  │
│                   │                             │
│  ┌────────────────▼──────────────────────────┐  │
│  │              Shell Core                   │  │
│  │                                           │  │
│  │  ┌──────────────────────────────────────┐ │  │
│  │  │         Plugin Manager               │ │  │
│  │  │                                      │ │  │
│  │  │  Entity Plugins:                     │ │  │
│  │  │  ┌─────────────┐ ┌─────────────┐    │ │  │
│  │  │  │ Note Plugin │ │ Task Plugin │    │ │  │
│  │  │  │• Note entity│ │• Task entity│    │ │  │
│  │  │  │• Note tools │ │• Task tools │    │ │  │
│  │  │  └─────────────┘ └─────────────┘    │ │  │
│  │  │                                      │ │  │
│  │  │  Feature Plugins:                    │ │  │
│  │  │  ┌─────────────┐ ┌─────────────┐    │ │  │
│  │  │  │  Git Sync   │ │   Backup    │    │ │  │
│  │  │  │• Sync tools │ │• Export tool│    │ │  │
│  │  │  └─────────────┘ └─────────────┘    │ │  │
│  │  │                                      │ │  │
│  │  │  Interface Plugins:                  │ │  │
│  │  │  ┌─────────────────────────────┐    │ │  │
│  │  │  │      Web Server             │    │ │  │
│  │  │  │ • HTTP/WebSocket server    │    │ │  │
│  │  │  │ • REST & GraphQL APIs      │    │ │  │
│  │  │  │ • Web UI hosting           │    │ │  │
│  │  │  │ • MCP over HTTP            │    │ │  │
│  │  │  └─────────────────────────────┘    │ │  │
│  │  └──────────────────────────────────────┘ │  │
│  │                                           │  │
│  │  ┌──────────────────────────────────────┐ │  │
│  │  │         Core Services                │ │  │
│  │  │  • EntityService  • QueryProcessor   │ │  │
│  │  │  • AI Services    • Database         │ │  │
│  │  │  • BrainProtocol  • MessageBus       │ │  │
│  │  └──────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘

Key Architecture Points:
1. MCP Server is always initialized with the Shell
2. All functionality exposed as MCP tools/resources
3. Plugins register their tools with the MCP server
4. Interface clients connect via MCP protocol
5. Single deployable with multiple entry points
```

### 2. Shell Initialization and Plugin Architecture

The Shell follows an Astro-like configuration pattern for plugin management:

```typescript
// Configuration with declarative plugin setup
const shell = Shell.getInstance({
  database: { url: "file:./brain.db" },
  ai: {
    provider: "anthropic",
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  plugins: [
    // Plugins are configured, not manually registered
    gitSync({ repoPath: "./brain-repo", autoSync: false }),
    notePlugin({ defaultFormat: "markdown" }),
    taskPlugin({ defaultPriority: "medium" }),
  ],
});

// Single initialize call sets up everything
await shell.initialize();
```

**Key Architectural Decisions:**

1. **Plugin Initialization Order**:
   - Plugins are NOT initialized in configuration order
   - PluginManager resolves dependencies automatically
   - Plugins with no dependencies initialize first
   - Circular dependencies are detected and reported

2. **Error Handling**:
   - Plugin failures don't crash the Shell
   - Failed plugins are tracked and can be queried
   - Shell operates in degraded mode if needed
   - Clear error messages for debugging

3. **MCP Server Integration**:
   - MCP server is a core component, not a plugin
   - Always available in plugin context
   - Cannot be disabled or replaced
   - Future transport options (HTTP) via config

4. **Service Availability**:
   - All core services are created before plugin init
   - Plugins can rely on services being available
   - No need for defensive coding in plugins

### 3. Entity Framework

The entity framework uses a functional approach with factory functions and Zod schemas:

- **Base Entity Schema**: Common properties (id, type, created, updated, tags)
- **Entity Registry**: Registration system for entity types and adapters
- **Entity Adapters**: Convert between entities and markdown storage
- **Entity Service**: Unified CRUD operations and search

Key Design Principles:

- **Functional Approach**: Factory functions, not classes, for entities
- **Markdown Storage**: All entities stored as markdown with frontmatter
- **Type Safety**: Zod schemas for validation
- **Adapter Pattern**: Each entity type has an adapter for serialization

```
┌─────────────────────────────────────┐
│          Entity Framework           │
│                                     │
│  Entity Creation (Functional):      │
│  ┌─────────────────────────────┐    │
│  │ const note = createNote({   │    │
│  │   title: "My Note",         │    │
│  │   content: "...",           │    │
│  │   tags: ["work"]            │    │
│  │ });                         │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │      EntityRegistry         │    │
│  │  • Register entity types    │    │
│  │  • Register adapters        │    │
│  │  • Validate entities        │    │
│  └──────────┬──────────────────┘    │
│             │                       │
│  ┌──────────▼──────────────────┐    │
│  │      EntityService          │    │
│  │  • CRUD operations          │    │
│  │  • Vector search            │    │
│  │  • Tag-based search         │    │
│  └──────────┬──────────────────┘    │
│             │                       │
│  ┌──────────▼──────────────────┐    │
│  │   Database (SQLite)         │    │
│  │  • Markdown storage         │    │
│  │  • Vector embeddings        │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

### 3. Entity Plugins

Entity plugins are the primary plugin type, representing domains of functionality:

**Planned Entity Plugins:**

- **Link Plugin**: Web content capture with AI summarization (first priority)
- **Article Plugin**: Long-form content with draft/publish workflow (second priority)
- **Task Plugin**: Task tracking and management
- **Profile Plugin**: User and contact profiles
- **Project Plugin**: Project organization and metadata

**What Entity Plugins Provide:**

- **Entity Type**: Domain-specific entity (e.g., Note, Task)
- **Factory Function**: Creates entities with validation
- **Entity Adapter**: Handles markdown serialization
- **Commands**: Domain operations (e.g., create-note, list-notes)
- **Message Handlers**: Async operations and events
- **Services**: Business logic and operations

```
┌─────────────────────────────────────┐
│        Note Plugin                  │
│                                     │
│  Registration:                      │
│  ┌─────────────────────────────┐    │
│  │ plugin.register(context) {  │    │
│  │   // Register entity type   │    │
│  │   entityRegistry.register(  │    │
│  │     "note",                 │    │
│  │     noteSchema,             │    │
│  │     noteAdapter             │    │
│  │   );                        │    │
│  │                             │    │
│  │   // Register commands      │    │
│  │   brainProtocol.register(   │    │
│  │     "create-note",          │    │
│  │     createNoteHandler       │    │
│  │   );                        │    │
│  │                             │    │
│  │   // Register messages      │    │
│  │   messageBus.register(      │    │
│  │     "note.created",         │    │
│  │     noteCreatedHandler      │    │
│  │   );                        │    │
│  │ }                           │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

### 4. Client Interfaces

Multiple client interfaces can connect to the brain through the MCP server:

- **MCP Clients**: Any MCP-compatible client (Claude Desktop, VS Code, etc.)
- **CLI Interface**: Command-line interface (implemented as MessageInterfacePlugin)
- **Matrix Interface**: Matrix chat interface (implemented as MessageInterfacePlugin)
- **Web Interface**: Through the webserver plugin
- **Custom Clients**: Any client that implements the MCP protocol

```
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│   MCP Clients   │   │  CLI Interface  │   │ Matrix Interface│
│  (Claude, etc)  │   │    (Plugin)     │   │    (Plugin)     │
└────────┬────────┘   └────────┬────────┘   └────────┬────────┘
         │                     │                     │
         ▼                     ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                        MCP Server                           │
│                   (stdio or HTTP transport)                 │
└─────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                      Brain Shell                            │
│              (Query Processing, Entity Management)           │
└─────────────────────────────────────────────────────────────┘
```

### 5. Deployment Architecture

The brain application uses a single-bundle deployment strategy with multiple entry points:

**Entry Router Pattern:**

```typescript
// apps/personal-brain/src/index.ts
import { runBrainApp } from "@brains/shell";
import { notePlugin, taskPlugin } from "@brains/plugins";
import { gitSync } from "@brains/git-sync";
import { webServer } from "@brains/web-server";

runBrainApp({
  plugins: [
    // Entity plugins
    notePlugin(),
    taskPlugin(),

    // Feature plugins
    gitSync({
      repoPath: "./brain-repo",
      autoSync: true,
    }),

    // Interface plugins
    webServer({
      port: 3000,
      cors: true,
    }),
  ],

  // Entry points for external interfaces
  entryPoints: {
    cli: () => import("./cli.js"),
    matrix: () => import("./matrix.js"),
  },
});

// Interface plugins are now part of the main app configuration
// No separate entry points needed - they register with the shell

// Example: Starting the app with different modes
// ./brain              # Starts all configured plugins
// ./brain --only-mcp   # Start only MCP server interface
// ./brain --no-web     # Start without web server
```

**Bundling with Bun:**

```bash
# Build single bundle with all interfaces
bun build src/index.ts --outfile=dist/brain.js --target=node

# Usage
./brain              # Start brain with all configured plugins
./brain --help       # Show available options
```

**Benefits:**

- Single deployable artifact
- Dynamic loading of interfaces
- Tree-shaking removes unused code
- Easy distribution and installation

## Data Flow

The typical data flow in the application follows these steps:

1. User input is received through any client interface (MCP client, CLI, Matrix, etc.)
2. The client sends a request to the MCP server (via stdio or HTTP)
3. The MCP server routes the request to the Shell's BrainProtocol
4. The BrainProtocol processes the command or query through the appropriate components
5. The QueryProcessor or command handler accesses entities and services as needed
6. Results flow back through the MCP server to the client
7. The client presents the results to the user in its preferred format

## Repository Structure

The "brains" repository is designed to support multiple brain implementations:

### Core Infrastructure (Shared by all brains)

- **@brains/shell**: Core infrastructure and plugin system
- **@brains/mcp-server**: MCP protocol server
- **@brains/utils**: Shared utilities

### Client Packages (Future)

- **@brains/cli**: Command-line interface
- **@brains/matrix**: Matrix chat interface

### Entity Plugins

Entity plugins are implemented as separate packages:

- **@brains/note-plugin**: Note management functionality
- **@brains/task-plugin**: Task management functionality (future)
- **@brains/profile-plugin**: User profile functionality (future)
- **@brains/project-plugin**: Project management functionality (future)

This separation ensures:

- Clear boundaries between plugins and shell
- Explicit public APIs through package exports
- Independent testing and versioning
- Reusability across different brain types

### Brain Applications

- **apps/personal-brain**: Personal knowledge management
- **apps/team-brain**: Team collaboration (future)
- **apps/collective-brain**: Community knowledge (future)

## Schema Validation

All data structures in the application use Zod schemas for validation:

- **Message Schemas**: Validate all messages between components
- **Entity Schemas**: Validate entity data structures
- **Command Schemas**: Validate command inputs and outputs
- **Configuration Schemas**: Validate application configuration

## Testing Strategy

The application uses focused, behavior-based testing:

- **Unit Tests**: Test the observable behavior of components
- **Schema Tests**: Verify schema validation works correctly
- **Command Tests**: Verify commands produce expected outputs
- **Integration Testing**: Full stack testing with [Test Brain App](./test-brain-app.md)
- **Manual Testing**: Direct verification through CLI and Matrix

## Additional Features

- **Version Control**: [Git Sync](./git-sync.md) provides backup and synchronization
- **Executable Distribution**: Apps compile to single binaries using Bun
- **Multi-Brain Support**: Architecture supports personal, team, and collective brains
