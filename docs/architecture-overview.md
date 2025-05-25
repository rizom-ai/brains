# Architecture Overview

The Personal Brain application features a modular, plugin-based architecture built around a core shell that provides essential infrastructure for knowledge management.

## Core Architecture Principles

1. **Monolithic Shell with Plugin Support**: Core functionality lives in the shell package, with plugin interfaces for extensibility
2. **Functional Entity Model**: Uses factory functions and Zod schemas for entity creation, not classes
3. **Schema-First Design**: All data structures use Zod schemas for validation and type safety
4. **Component Interface Standardization**: Consistent singleton pattern across all major components
5. **Behavioral Testing**: Focus on testing behavior rather than implementation details

## Current Implementation State

### Implemented Packages

- **packages/shell**: Core brain infrastructure with all essential components
  - Registry system with singleton pattern
  - Plugin framework with lifecycle management
  - Entity model with adapters and markdown storage
  - Database layer with Drizzle ORM and vector support
  - Messaging system with pub/sub pattern
  - Query processor for natural language processing
  - AI services (embeddings via FastEmbed, chat via Anthropic)
  - MCP tool/resource integration
- **packages/mcp-server**: MCP protocol server implementation
- **packages/utils**: Shared utilities including logging and markdown processing

### Future Packages (Planned)

- **packages/cli**: Command-line interface package
- **packages/matrix-bot**: Matrix bot interface package
- **apps/personal-brain**: Unified application supporting multiple modes
- **apps/team-brain**: Team collaboration brain
- **apps/collective-brain**: Community knowledge brain

See [Package Structure](./architecture/package-structure.md) for detailed information.

## Key Components

### 1. Shell Core (packages/shell)

The shell provides the core infrastructure and extension points for plugins:

**Core Infrastructure:**

- **Registry System**: Component registration and dependency injection
- **Plugin Manager**: Manages plugin lifecycles and dependencies
- **Entity Framework**: Base entity types, registry, and adapters
- **Database Layer**: SQLite with vector support (384 dimensions)
- **AI Services**: Local embeddings (FastEmbed) and chat (Anthropic)
- **Query Processor**: Natural language query handling
- **Messaging System**: Pub/sub message passing between components
- **Brain Protocol**: Command routing and execution

**Plugin Types:**

- **Context Plugins** (primary): Domain-specific functionality (Note, Task, Profile)
- **Interface Plugins** (future): External interfaces (CLI, Matrix)
- **Feature Plugins** (future): Additional capabilities (sync, backup)

```
                External Interfaces
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ MCP Server  │  │  CLI (fut)  │  │Matrix (fut) │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
       ▼                ▼                ▼
┌─────────────────────────────────────────────────┐
│                 Shell Core                      │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │            Plugin Manager                 │  │
│  │                                           │  │
│  │  Manages all plugin types:                │  │
│  │  ┌─────────────┐ ┌─────────────┐         │  │
│  │  │Note Context │ │Task Context │         │  │
│  │  │             │ │             │         │  │
│  │  │• Note entity│ │• Task entity│         │  │
│  │  │• Note cmds  │ │• Task cmds  │         │  │
│  │  │• Note msgs  │ │• Task msgs  │         │  │
│  │  └─────────────┘ └─────────────┘         │  │
│  └─────────────┬─────────────────────────────┘  │
│                │                               │
│                ▼                               │
│  ┌───────────────────────────────────────────┐  │
│  │         Extension Points                  │  │
│  │                                           │  │
│  │  BrainProtocol ← register commands        │  │
│  │  MessageBus   ← register handlers         │  │
│  │  EntityRegistry ← register types          │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │           Core Services                   │  │
│  │  • EntityService  • QueryProcessor        │  │
│  │  • AI Services   • Database               │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘

How Plugins Extend the Shell:
1. Context plugins register entity types with EntityRegistry
2. Plugins register commands with BrainProtocol
3. Plugins register message handlers with MessageBus
4. All plugins share the same core services and infrastructure
5. Plugin Manager handles initialization order and dependencies
```

### 2. Entity Framework

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

### 3. Context Plugins

Context plugins are the primary plugin type, representing domains of functionality:

**Current Context Plugins (planned):**

- **Note Context**: Note management with markdown support
- **Task Context**: Task tracking and management
- **Profile Context**: User profiles and preferences
- **Project Context**: Project organization

**What Context Plugins Provide:**

- **Entity Type**: Domain-specific entity (e.g., Note, Task)
- **Factory Function**: Creates entities with validation
- **Entity Adapter**: Handles markdown serialization
- **Commands**: Domain operations (e.g., create-note, list-notes)
- **Message Handlers**: Async operations and events
- **Services**: Business logic and operations

```
┌─────────────────────────────────────┐
│      Note Context Plugin            │
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

### Context Plugins

Context plugins are implemented as separate packages:

- **@brains/note-context**: Note management functionality
- **@brains/task-context**: Task management functionality (future)
- **@brains/profile-context**: User profile functionality (future)
- **@brains/project-context**: Project management functionality (future)

This separation ensures:

- Clear boundaries between contexts and shell
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
