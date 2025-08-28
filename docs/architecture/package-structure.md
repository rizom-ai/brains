# Package Structure

## Overview

The Brains repository uses a 4-directory monorepo structure designed to support modular development with clear separation of concerns between core infrastructure, shared utilities, feature plugins, and user interfaces.

## Directory Organization

```
brains/
├── shell/              # Core infrastructure & services
├── shared/             # Shared utilities and base packages
├── plugins/            # Feature extensions
├── interfaces/         # User interaction layers
└── apps/               # Example applications
```

## Shell (Core Infrastructure)

The shell directory contains the core services that power the brain application. These packages were extracted from a monolithic shell to improve maintainability (44% reduction in complexity).

### Core Packages

#### `shell/core`

- **Purpose**: Plugin system and coordination (~1,900 lines)
- **Responsibilities**:
  - Plugin lifecycle management
  - Component initialization
  - MCP server integration
  - Configuration management
- **Key Classes**: Shell, PluginManager, PluginContextFactory

#### `shell/db`

- **Purpose**: Database layer with vector support
- **Responsibilities**:
  - SQLite database with libSQL
  - Vector embeddings (384 dimensions)
  - Schema migrations with Drizzle
  - Connection management
- **Technologies**: libSQL, Drizzle ORM

#### `shell/entity-service`

- **Purpose**: Entity CRUD operations and management
- **Responsibilities**:
  - Entity registry and validation
  - CRUD operations
  - Vector search capabilities
  - Entity adapters for serialization
- **Key Classes**: EntityService, EntityRegistry

#### `shell/messaging-service`

- **Purpose**: Event-driven messaging system
- **Responsibilities**:
  - Pub/sub message bus
  - Event routing
  - Message validation
  - Handler registration
- **Size**: 439 lines

#### `shell/service-registry`

- **Purpose**: Dependency injection and service registration
- **Responsibilities**:
  - Service lifecycle management
  - Dependency resolution
  - Singleton pattern implementation
- **Size**: 168 lines

#### `shell/render-service`

- **Purpose**: Route registry and view template management
- **Responsibilities**:
  - Route management
  - View template registration
  - Output format handling
  - Renderer coordination
- **Size**: ~250 lines

#### `shell/ai-service`

- **Purpose**: AI model integration
- **Responsibilities**:
  - Anthropic Claude integration
  - Chat completions
  - Error handling and retries
- **Size**: 178 lines

#### `shell/embedding-service`

- **Purpose**: Vector embedding generation
- **Responsibilities**:
  - FastEmbed integration
  - Text-to-vector conversion
  - Embedding caching
- **Size**: 181 lines

#### `shell/content-generator`

- **Purpose**: AI-powered content generation
- **Responsibilities**:
  - Template-based generation
  - Prompt management
  - Content validation

#### `shell/app`

- **Purpose**: Application bootstrapper
- **Responsibilities**:
  - Unified app initialization
  - Configuration helpers
  - Environment setup

#### `shell/job-queue`

- **Purpose**: Background job processing
- **Responsibilities**:
  - Job enqueuing and processing
  - Batch operations
  - Progress monitoring
  - Worker management
- **Features**: SQLite-based queue, retry logic

## Shared (Utilities and Base Packages)

### Base Packages

#### `shared/content-management`

- **Purpose**: Content operations and management
- **Exports**:
  - ContentManager for batch operations
  - Entity query services
  - Generation and derivation operations

#### `shared/plugin-utils`

- **Purpose**: Plugin base classes
- **Exports**:
  - `BasePlugin` - Standard plugin functionality
  - `InterfacePlugin` - For non-message interfaces
  - `MessageInterfacePlugin` - For chat-like interfaces
- **Key Features**: Lifecycle management, configuration validation

#### `shared/utils`

- **Purpose**: Common utilities
- **Exports**:
  - Logger with debug levels
  - Markdown processing
  - Permission handling
  - YAML parsing
  - Progress tracking

#### `shared/types`

- **Purpose**: Shared TypeScript types
- **Note**: Recently decoupled - types now live with their packages

#### `shared/test-utils`

- **Purpose**: Testing utilities
- **Exports**:
  - Test harness
  - Mock factories
  - Plugin testing helpers

#### `shared/message-interface`

- **Purpose**: Base classes for message-based interfaces
- **Exports**:
  - MessageInterfacePlugin base class
  - Command registration system
  - Message handling utilities

#### `shared/daemon-registry`

- **Purpose**: Daemon process management
- **Features**: Process tracking, graceful shutdown
- **Note**: Currently in shared/ but only used by shell/core - candidate for relocation

#### `shared/default-site-content`

- **Purpose**: Default website templates
- **Includes**:
  - Hero, Features, CTA, Products sections
  - Formatters and layouts
  - Content generation prompts

#### `shared/ui-library`

- **Purpose**: Shared UI components
- **Features**: Ink-based components for CLI interfaces

## Interfaces (User Interaction Layers)

All interfaces are implemented as plugins extending base classes from `shared/plugin-utils`.

### Interface Packages

#### `interfaces/cli`

- **Type**: MessageInterfacePlugin
- **Purpose**: Command-line interface
- **Features**:
  - Ink-based UI components
  - Command history
  - Interactive prompts
- **Status**: Basic implementation, Ink UI enhancement planned

#### `interfaces/matrix`

- **Type**: MessageInterfacePlugin
- **Purpose**: Matrix protocol bot
- **Features**:
  - Room management
  - Permission system
  - Mention detection
  - Command prefix support

#### `interfaces/mcp`

- **Type**: InterfacePlugin
- **Purpose**: Model Context Protocol server
- **Features**:
  - STDIO and HTTP transports
  - Tool registration from plugins
  - Progress notifications
  - Permission-based filtering

#### `interfaces/webserver`

- **Type**: InterfacePlugin
- **Purpose**: Static site server
- **Features**:
  - Serves generated sites
  - Preview and production modes
  - Configurable ports

## Plugins (Feature Extensions)

### Feature Plugins

#### `plugins/directory-sync`

- **Purpose**: File-based entity synchronization
- **Features**:
  - Import/export entities
  - Watch mode
  - Configurable entity types
  - Status formatting

#### `plugins/git-sync`

- **Purpose**: Version control integration
- **Features**:
  - Auto-commit on changes
  - Push/pull functionality
  - Branch management
  - Status reporting

#### `plugins/site-builder`

- **Purpose**: Static site generation
- **Features**:
  - Preact-based rendering
  - Template system
  - CSS processing
  - Content management
  - Dashboard hydration

## Apps (Example Applications)

### `apps/test-brain`

- **Purpose**: Reference implementation
- **Features**:
  - Demonstrates all plugins
  - Environment-based config
  - Example data
  - Deployment scripts

## Dependency Flow

```
apps/test-brain
    ├── interfaces/*    (via plugin registration)
    ├── plugins/*       (via plugin registration)
    ├── shell/app       (for initialization)
    └── shell/core      (for plugin management)
        └── shell/*     (core services)
            └── shared/* (utilities)
```

## Design Principles

1. **Focused Packages**: Each package has a single, clear responsibility
2. **Clean Dependencies**: Dependencies flow inward, never circular
3. **Plugin Architecture**: All features implemented as plugins
4. **Type Safety**: Zod schemas for all data validation
5. **Testability**: Each package independently testable
6. **Component Standardization**: Consistent patterns across all components

## Package Standards

### Plugin Interface

All plugins follow this pattern:

```typescript
export class MyPlugin extends BasePlugin {
  name = "my-plugin";

  async register(context: PluginContext): Promise<void> {
    // Register entities, tools, routes, etc.
  }

  async start(): Promise<void> {
    // Start any services
  }

  async stop(): Promise<void> {
    // Cleanup
  }
}
```

### Service Pattern

Core services use singleton pattern:

```typescript
export class MyService {
  private static instance: MyService | null = null;

  static getInstance(): MyService {
    if (!MyService.instance) {
      MyService.instance = new MyService();
    }
    return MyService.instance;
  }

  static resetInstance(): void {
    MyService.instance = null;
  }
}
```

## Building and Distribution

### Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Type checking
bun run typecheck

# Linting
bun run lint
```

### Production Builds

```bash
# Build for production
bun run build

# Create standalone executable
bun build apps/test-brain/src/index.ts --compile --outfile=brain
```

## Benefits of 4-Directory Structure

1. **Clear Organization**: Obvious where each type of code belongs
2. **Reduced Complexity**: Shell reduced by 44% through extraction
3. **Independent Development**: Teams can work on different directories
4. **Easy Plugin Development**: Clear patterns and base classes
5. **Flexible Deployment**: Choose which plugins to include
6. **Better Testing**: Focused packages are easier to test

## Migration Status

- ✅ Shell package decomposition complete
- ✅ 4-directory structure implemented
- ✅ All interfaces converted to plugins
- ✅ Types package decoupled
- ✅ Component Interface Standardization complete
- 🚧 Cross-package error handling in progress
- 📋 Entity plugins planned (Link, Article, Task, Profile, Project)
