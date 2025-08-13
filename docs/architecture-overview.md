# Architecture Overview

The Personal Brain application features a modular, plugin-based architecture built around a core shell that provides essential infrastructure for knowledge management.

## Core Architecture Principles

1. **MCP-First Design**: Every brain application is an MCP server, exposing all functionality through the Model Context Protocol
2. **Tool-First Architecture**: All functionality is exposed as self-describing tools with schemas; commands are generated from tools
3. **Monolithic Shell with Plugin Support**: Core functionality lives in the shell package, with plugin interfaces for extensibility
4. **Functional Entity Model**: Uses factory functions and Zod schemas for entity creation, not classes
5. **Schema-First Design**: All data structures use Zod schemas for validation and type safety
6. **Component Interface Standardization**: Consistent singleton pattern across all major components
7. **Direct Registration Pattern**: PluginManager directly calls registry methods (no event-based registration)

## Current Implementation State

The codebase follows a 4-directory monorepo structure managed by Turborepo:

### Shell Packages (Core Infrastructure)

- **shell/core**: Central shell with plugin management and core infrastructure
- **shell/ai-service**: AI text and object generation using Anthropic
- **shell/app**: Application initialization and lifecycle management
- **shell/command-registry**: Command registration and management
- **shell/content-generator**: Template-based content generation system
- **shell/conversation-service**: Conversation and message management with memory
- **shell/daemon-registry**: Long-running process management
- **shell/embedding-service**: Text embeddings via FastEmbed
- **shell/entity-service**: Entity CRUD operations and search with vector support
- **shell/job-queue**: Background job processing system with progress tracking
- **shell/mcp-service**: MCP server and tool/resource registration
- **shell/messaging-service**: Event-driven messaging with pub/sub
- **shell/plugins**: Plugin base classes and interfaces
- **shell/service-registry**: Component registration and dependency injection
- **shell/view-registry**: Route and template management for views

### Shared Packages (Cross-Cutting Concerns)

- **shared/content-management**: Content operations and management
- **shared/default-site-content**: Default templates and formatters
- **shared/ui-library**: Shared UI components (Ink-based)
- **shared/utils**: Common utilities (logging, markdown, permissions, formatters)
- **shared/eslint-config**: Shared ESLint configuration
- **shared/typescript-config**: Shared TypeScript configuration

### Interface Packages (User Interfaces)

- **interfaces/cli**: Command-line interface using Ink
- **interfaces/matrix**: Matrix bot interface (includes setup utility)
- **interfaces/mcp**: MCP transport layer (stdio and HTTP)
- **interfaces/webserver**: Static site server

### Plugin Packages (Feature Extensions)

- **plugins/directory-sync**: File-based entity synchronization
- **plugins/git-sync**: Version control integration
- **plugins/site-builder**: Static site generation with Preact
- **plugins/system**: System commands and conversation memory tools
- **plugins/topics**: Topic extraction and management

### Application Packages

- **apps/test-brain**: Reference implementation and testing

## Key Components

### 1. Shell Core (shell/core)

The shell provides the core infrastructure and extension points for plugins:

**Core Services:**

- Plugin Manager with dependency resolution
- Entity Framework with base types and adapters
- Database initialization and configuration
- Shell configuration management
- Template system for queries and responses

### 2. MCP Service Architecture

The MCP architecture is split between core service and transport layer:

**MCP Service (shell/mcp-service):**

- Creates and manages the MCP server instance
- Handles tool and resource registration from plugins
- Manages permission levels for different transports
- Provides IMCPTransport interface for transport layers

**MCP Interface (interfaces/mcp):**

- Implements transport protocols (stdio and HTTP)
- Manages client connections
- Routes requests to MCP service
- Handles transport-specific logging requirements

### 3. Plugin System

The plugin system uses direct registration with shell services:

**Plugin Types:**

- **CorePlugin**: Provides tools, resources, commands, and handlers
- **InterfacePlugin**: Provides user interfaces and daemons
- **MessageInterfacePlugin**: Specialized for message-based interfaces

**Registration Flow:**

1. PluginManager initializes plugins in dependency order
2. Plugins receive context with all shell services
3. Plugins register capabilities directly with registries
4. No event-based registration (eliminates timing issues)

### 4. Entity Framework

The entity framework uses a functional approach:

- **Base Entity Schema**: Common properties (id, type, created, updated, tags)
- **Entity Registry**: Registration system for entity types and adapters
- **Entity Adapters**: Convert between entities and markdown storage
- **Entity Service**: Unified CRUD operations with vector search

### 5. Conversation Memory System

The conversation service provides memory capabilities:

- **Conversation Management**: Track conversations by interface and channel
- **Message Storage**: Store and retrieve conversation messages
- **Memory Tools**: MCP tools for conversation context (via SystemPlugin)
- **Interface Integration**: Each interface maintains conversation continuity

## Data Flow

1. **User Input**: Received through any interface (CLI, Matrix, MCP client)
2. **Transport Layer**: Routes request to appropriate handler
3. **Command/Tool Execution**: Processes through registered handlers
4. **Service Layer**: Accesses entities, AI, and other services
5. **Response Formatting**: Formats response for the interface
6. **User Output**: Delivered through the originating interface

## Deployment Architecture

The brain application supports multiple deployment strategies:

**Development:**

- Run directly with Bun for hot reloading
- All interfaces available simultaneously

**Production:**

- Compile to single executable with Bun
- Environment-based configuration
- Support for Docker deployment

## Testing Strategy

- **Unit Tests**: Component behavior testing with Bun test
- **Integration Tests**: Cross-package testing with test harnesses
- **Plugin Testing**: Standardized PluginTestHarness for all plugin types
- **Manual Testing**: Direct verification through interfaces

## Next Steps

See [roadmap.md](./roadmap.md) for planned features and improvements.
