# Architecture Overview

The Personal Brain application is being rebuilt with a more modular, plugin-based architecture that addresses several key challenges in the current codebase. This document provides a high-level overview of the new architecture.

## Core Architecture Principles

1. **Plugin-Based Architecture**: All functionality is implemented as plugins that register with a core shell.
2. **Extensible Entity Model**: A unified approach to data modeling that contexts can extend.
3. **Schema-First Design**: All data structures use Zod schemas for validation and type safety.
4. **Clear Component Boundaries**: Well-defined interfaces between all components.
5. **Behavioral Testing**: Focus on testing behavior rather than implementation details.

## Package Structure

The "brains" repository supports multiple brain implementations with shared infrastructure:

- **packages/shell**: Core brain infrastructure shared by all brain types
- **packages/mcp-server**: MCP protocol server implementation 
- **packages/utils**: Shared utilities including logging and markdown processing
- **packages/cli**: Command-line interface package (future)
- **packages/matrix-bot**: Matrix bot interface package (future)
- **apps/personal-brain**: Personal knowledge management brain
- **apps/team-brain**: Team collaboration brain (future)
- **apps/collective-brain**: Community knowledge brain (future)

The architecture emphasizes shared core infrastructure that can be specialized for different brain types, with each brain accessible through multiple client interfaces.

See [Package Structure](./architecture/package-structure.md) for detailed information.

## Key Components

### 1. Shell Core (packages/shell)

The shell provides the essential infrastructure for the application:

- **Registry System**: Central registration and resolution of components
- **Plugin Framework**: Registration and lifecycle management for plugins
- **Messaging System**: Schema-validated message passing between components
- **MCP Server**: HTTP and stdio interfaces for external communication
- **Protocol Layer**: Command handling and message routing

```
┌─────────────────────────────────────┐
│             MCP Server              │
│  ┌─────────┐         ┌───────────┐  │
│  │  HTTP   │         │   Stdio   │  │
│  └─────────┘         └───────────┘  │
│             ▲               ▲       │
└─────────────┼───────────────┼───────┘
              │               │
              ▼               ▼
┌─────────────────────────────────────┐
│          Brain Protocol             │
│  ┌─────────┐         ┌───────────┐  │
│  │ Command │         │  Message  │  │
│  │ Router  │         │  Handler  │  │
│  └─────────┘         └───────────┘  │
│             ▲               ▲       │
└─────────────┼───────────────┼───────┘
              │               │
              ▼               ▼
┌─────────────────────────────────────┐
│           Plugin System             │
│  ┌─────────┐         ┌───────────┐  │
│  │ Context │         │  Feature  │  │
│  │ Registry│         │  Registry │  │
│  └─────────┘         └───────────┘  │
└─────────────────────────────────────┘
```

### 2. Entity Framework

The entity framework provides a unified approach to data modeling:

- **Base Entity Types**: Common properties and behaviors
- **Entity Registry**: Registration system for entity types
- **Entity Adapters**: Type-specific adapters for storage and processing
- **Repository**: Unified data access layer

```
┌─────────────────────────────────────┐
│          Entity Framework           │
│  ┌─────────┐         ┌───────────┐  │
│  │ Entity  │         │  Entity   │  │
│  │ Registry│         │  Adapter  │  │
│  └─────────┘         └───────────┘  │
│             ▲               ▲       │
└─────────────┼───────────────┼───────┘
              │               │
              ▼               ▼
┌─────────────────────────────────────┐
│          Repository Layer           │
│  ┌─────────┐         ┌───────────┐  │
│  │ Storage │         │  Search   │  │
│  │ Access  │         │  Service  │  │
│  └─────────┘         └───────────┘  │
└─────────────────────────────────────┘
```

### 3. Context Plugins

Each domain of functionality is implemented as a context plugin:

- **Entity Definitions**: Context-specific entity types
- **Tool Definitions**: Commands and tools for the context
- **Message Handlers**: Processing of context-specific messages
- **Services**: Business logic for the context

Example structure of a context plugin:

```
┌─────────────────────────────────────┐
│           Note Context              │
│  ┌─────────┐         ┌───────────┐  │
│  │  Note   │         │   Note    │  │
│  │ Entity  │         │  Adapter  │  │
│  └─────────┘         └───────────┘  │
│                                     │
│  ┌─────────┐         ┌───────────┐  │
│  │  Note   │         │   Note    │  │
│  │ Service │         │   Tools   │  │
│  └─────────┘         └───────────┘  │
│                                     │
│  ┌─────────────────────────────┐    │
│  │     Message Handlers        │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

### 4. Client Interfaces

Multiple client interfaces can connect to the brain through the MCP server:

- **MCP Clients**: Any MCP-compatible client (Claude Desktop, VS Code, etc.)
- **CLI Package**: Command-line interface (future package)
- **Matrix Package**: Matrix chat interface (future package)
- **Custom Clients**: Any client that implements the MCP protocol

```
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│   MCP Clients   │   │  CLI Package    │   │ Matrix Package  │
│  (Claude, etc)  │   │    (future)     │   │    (future)     │
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

### Context Plugins (Shared across brain types)
- **@brains/note-context**: Note management functionality
- **@brains/task-context**: Task management functionality
- **@brains/person-context**: Person/profile management functionality
- **@brains/project-context**: Project management functionality

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
