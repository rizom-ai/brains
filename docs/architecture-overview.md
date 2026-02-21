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

The codebase follows a monorepo structure managed by Turborepo with packages organized by function:

### Shell Packages (Core Infrastructure)

- **shell/core**: Central shell with plugin management and core infrastructure
- **shell/ai-service**: AI text and object generation using Anthropic
- **shell/command-registry**: Command registration and management
- **shell/content-service**: Template-based content generation system
- **shell/conversation-service**: Conversation and message management with memory
- **shell/daemon-registry**: Long-running process management
- **shell/datasource**: Data source registry for extensible data fetching
- **shell/embedding-service**: Text embeddings via FastEmbed
- **shell/entity-service**: Entity CRUD operations and search with vector support
- **shell/identity-service**: Brain identity (AI personality) management
- **shell/profile-service**: Profile (person/organization) data management
- **shell/job-queue**: Background job processing system with progress tracking
- **shell/mcp-service**: MCP server and tool/resource registration
- **shell/messaging-service**: Event-driven messaging with pub/sub
- **shell/permission-service**: Permission and access control
- **shell/plugins**: Plugin base classes and interfaces
- **shell/render-service**: Route registry and view template management
- **shell/service-registry**: Component registration and dependency injection
- **shell/templates**: Template registry and management system

### Shared Packages (Cross-Cutting Concerns)

- **shared/default-site-content**: Default templates and formatters for site generation
- **shared/product-site-content**: Product-specific site content and templates
- **shared/theme-default**: Default theme for web interfaces
- **shared/ui-library**: Shared UI components (Ink-based)
- **shared/utils**: Common utilities (logging, markdown, permissions, formatters, Zod)
- **shared/eslint-config**: Shared ESLint configuration
- **shared/typescript-config**: Shared TypeScript configuration

### Interface Packages (User Interfaces)

- **interfaces/cli**: Command-line interface using Ink with React components
- **interfaces/matrix**: Matrix bot interface with E2E encryption support
- **interfaces/mcp**: MCP transport layer (stdio and HTTP)
- **interfaces/webserver**: HTTP server for static site serving

### Plugin Packages (Feature Extensions)

- **plugins/analytics**: Cloudflare analytics integration
- **plugins/blog**: Blog post management with RSS feeds and series
- **plugins/content-pipeline**: Publishing queue with scheduling and retry
- **plugins/dashboard**: Extensible widget system for dashboards
- **plugins/decks**: Slide deck and presentation management
- **plugins/directory-sync**: Import/export entities to/from file system
- **plugins/git-sync**: Sync entities with Git repositories
- **plugins/image**: AI-powered image generation
- **plugins/link**: Web content capture with AI-powered extraction
- **plugins/newsletter**: Buttondown newsletter integration
- **plugins/note**: Personal knowledge capture
- **plugins/plugin-examples**: Example plugins demonstrating all plugin types
- **plugins/portfolio**: Portfolio project showcase
- **plugins/professional-site**: Professional homepage templates
- **plugins/site-builder**: Static site generation with Preact and Tailwind CSS v4
- **plugins/site-content**: AI-generated content for site sections, queries routes via messaging
- **plugins/social-media**: Multi-provider social media posting
- **plugins/summary**: AI-powered content summarization and daily digests
- **plugins/system**: System information and health checks
- **plugins/topics**: AI-powered topic extraction from entities

### Application Packages

- **apps/team-brain**: Team collaboration instance with custom configuration
- **apps/collective-brain**: Collective knowledge brain with comprehensive plugin setup
- **apps/app**: High-level application framework with simplified API

## Key Components

### 1. App Framework (@brains/app)

High-level application framework that simplifies brain creation:

**Features:**

- Simplified configuration API
- Automatic plugin loading
- Built-in interfaces (CLI, MCP, Matrix, Webserver)
- Environment-based configuration
- Docker and deployment support

### 2. Shell Core (shell/core)

The shell provides the core infrastructure and extension points for plugins:

**Core Services:**

- Plugin Manager with dependency resolution
- Entity Framework with base types and adapters
- Database initialization and configuration
- Shell configuration management
- Service coordination and lifecycle management

### 3. MCP Service Architecture

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

### 4. Plugin System

The plugin system uses direct registration with shell services:

**Plugin Types:**

- **CorePlugin**: Provides tools, resources, commands, and handlers
- **ServicePlugin**: Provides shared services for other plugins
- **InterfacePlugin**: Provides user interfaces and daemons
- **MessageInterfacePlugin**: Specialized for message-based interfaces

**Registration Flow:**

1. PluginManager initializes plugins in dependency order
2. Plugins receive context with all shell services
3. Plugins register capabilities directly with registries
4. No event-based registration (eliminates timing issues)

### 5. Entity Framework

The entity framework uses a functional approach:

- **Base Entity Schema**: Common properties (id, type, created, updated, tags)
- **Entity Registry**: Registration system for entity types and adapters
- **Entity Adapters**: Convert between entities and markdown storage
- **Entity Service**: Unified CRUD operations with vector search

### 6. Conversation Memory System

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
- Local Docker testing with docker-compose

**Production (Hetzner Cloud):**

- Terraform-managed infrastructure with per-app isolation
- Docker containers with automated builds and registry push
- Caddy reverse proxy with automatic HTTPS via Let's Encrypt
- Separate servers for each app instance
- Idempotent deployments handling existing infrastructure

**Production (Docker):**

- Single Docker image with all dependencies
- Environment-based configuration via .env files
- Volume mounts for persistent data
- Support for docker-compose orchestration

**Production (Binary):**

- Compile to single executable with Bun
- Systemd service management
- Direct server deployment via SSH

## Testing Strategy

- **Unit Tests**: Component behavior testing with Bun test
- **Integration Tests**: Cross-package testing with test harnesses
- **Plugin Testing**: Standardized PluginTestHarness for all plugin types
- **Manual Testing**: Direct verification through interfaces

## Next Steps

See [roadmap.md](./roadmap.md) for planned features and improvements.
