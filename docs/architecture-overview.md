# Architecture Overview

The Personal Brain application is being rebuilt with a more modular, plugin-based architecture that addresses several key challenges in the current codebase. This document provides a high-level overview of the new architecture.

## Core Architecture Principles

1. **Plugin-Based Architecture**: All functionality is implemented as plugins that register with a core shell.
2. **Extensible Entity Model**: A unified approach to data modeling that contexts can extend.
3. **Schema-First Design**: All data structures use Zod schemas for validation and type safety.
4. **Clear Component Boundaries**: Well-defined interfaces between all components.
5. **Behavioral Testing**: Focus on testing behavior rather than implementation details.

## Package Structure

The system follows a clean separation of concerns through multiple packages:

- **packages/shell**: Core brain infrastructure
- **packages/mcp-server**: MCP protocol implementation
- **packages/cli**: CLI functionality
- **packages/matrix-bot**: Matrix bot functionality
- **apps/brain**: Unified app with multiple runtime modes

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

### 4. Interface Adapters

The CLI and Matrix interfaces connect to the MCP server:

- **CLI Adapter**: Command-line interface
- **Matrix Adapter**: Matrix chat interface
- **Rendering**: Formatting of responses
- **Command Parsing**: Processing of user input

```
┌─────────────────────┐   ┌─────────────────────┐
│     CLI Interface   │   │   Matrix Interface  │
│  ┌───────────────┐  │   │  ┌───────────────┐  │
│  │ Command Parser│  │   │  │Message Handler│  │
│  └───────────────┘  │   │  └───────────────┘  │
│  ┌───────────────┐  │   │  ┌───────────────┐  │
│  │   Renderer    │  │   │  │   Formatter   │  │
│  └───────────────┘  │   │  └───────────────┘  │
└─────────────────────┘   └─────────────────────┘
           │                        │
           ▼                        ▼
┌─────────────────────────────────────────────┐
│                MCP Server                   │
└─────────────────────────────────────────────┘
```

## Data Flow

The typical data flow in the application follows these steps:

1. User input is received through CLI or Matrix interface
2. The interface formats the input as an MCP request
3. The MCP server processes the request and routes it to the BrainProtocol
4. The BrainProtocol identifies the appropriate context plugin
5. The context plugin processes the command and accesses the repository as needed
6. The repository interacts with the database and returns results
7. Results flow back through the same path to the user

## Package Structure

The application is organized as a Turborepo monorepo with the following packages:

- **@personal-brain/shell**: Core infrastructure and plugin system
- **@personal-brain/cli**: Command-line interface
- **@personal-brain/matrix**: Matrix chat interface
- **@personal-brain/note-context**: Note management functionality
- **@personal-brain/profile-context**: Profile management functionality
- **@personal-brain/website-context**: Website generation functionality
- **@personal-brain/conversation-context**: Conversation management functionality
- **@personal-brain/app**: Main application that integrates all components

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
- **Manual Testing**: Direct verification through CLI and Matrix
