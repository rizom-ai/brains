# Rizom Brains

A modular, extensible knowledge management system built on the Model Context Protocol (MCP). Every brain is an MCP server that exposes tools and resources for AI assistants to help manage your knowledge.

## Overview

Personal Brain provides:

- **Unified Entity Model**: Store notes, tasks, profiles, and custom entity types
- **Markdown-First Storage**: All content stored as markdown with YAML frontmatter
- **Vector Search**: Semantic search powered by local embeddings
- **Git Sync**: Version control and synchronization for your knowledge base
- **Plugin Architecture**: Extend with custom entity types and features
- **Multiple Interfaces**: CLI, Matrix bot, or direct MCP connection

## Quick Start

### Using the Test Brain App

```bash
# Clone the repository
git clone https://github.com/rizom-ai/brains.git
cd brains

# Install dependencies
bun install

# Build packages
bun run build

# Run the test brain app
cd apps/test-brain
bun run dev

# In another terminal, test with the CLI
bun run dev --cli
```

### Creating Your Own Brain App

```typescript
import { App } from "@brains/app";
import { gitSync } from "@brains/git-sync";

await App.run({
  name: "my-brain",
  version: "1.0.0",
  database: "./my-brain.db",
  plugins: [
    gitSync({
      repoPath: "./brain-repo",
      branch: "main",
      autoSync: true,
    }),
  ],
});
```

## Architecture

The project follows a **tool-first architecture** where all functionality is exposed through MCP tools and resources. This ensures everything is accessible to AI assistants.

### Core Packages

#### Shell (Core Infrastructure)

- **@brains/core**: Shell orchestrator and plugin management
- **@brains/ai-service**: AI text and object generation using Anthropic
- **@brains/command-registry**: Command registration and execution
- **@brains/content-service**: Template-based content generation
- **@brains/conversation-service**: Conversation and message management
- **@brains/daemon-registry**: Long-running process management
- **@brains/datasource**: Extensible data source registry
- **@brains/embedding-service**: Text embeddings via FastEmbed
- **@brains/entity-service**: Entity CRUD with vector search
- **@brains/identity-service**: User identity and preferences
- **@brains/job-queue**: Background job processing with progress
- **@brains/mcp-service**: MCP server and tool registration
- **@brains/messaging-service**: Event-driven pub/sub messaging
- **@brains/permission-service**: Permission and access control
- **@brains/plugins**: Plugin base classes and interfaces
- **@brains/render-service**: Route and view template management
- **@brains/service-registry**: Component registration and DI
- **@brains/templates**: Template registry and management

#### Interfaces

- **@brains/cli**: Interactive command-line interface using Ink
- **@brains/matrix**: Matrix bot with E2E encryption support
- **@brains/mcp**: MCP transport layer (stdio and HTTP)
- **@brains/webserver**: HTTP server for static sites

#### Plugins

- **@brains/directory-sync**: Import/export entities to file system
- **@brains/git-sync**: Sync entities with Git repositories
- **@brains/link**: Web content capture with AI extraction
- **@brains/plugin-examples**: Example plugin implementations
- **@brains/site-builder**: Static site generation with Preact/Tailwind
- **@brains/summary**: AI-powered summarization and daily digests
- **@brains/system**: System information and health checks
- **@brains/topics**: AI-powered topic extraction

#### Shared

- **@brains/default-site-content**: Default templates and formatters
- **@brains/product-site-content**: Product-specific site content
- **@brains/theme-default**: Default theme for web interfaces
- **@brains/ui-library**: Shared UI components (Ink-based)
- **@brains/utils**: Common utilities (logging, markdown, Zod)
- **@brains/eslint-config**: Shared ESLint configuration
- **@brains/typescript-config**: Shared TypeScript configuration

#### Applications

- **@brains/test-brain**: Reference implementation for testing
- **@brains/team-brain**: Team collaboration instance
- **@brains/app**: High-level application framework

### Key Concepts

1. **Entities**: Everything is an entity with a type, title, content, and tags
2. **Adapters**: Convert between entities and markdown for storage
3. **Plugins**: Extend functionality by adding tools, resources, and entity types
4. **Formatters**: Control how data is displayed in different contexts

## Documentation

- [Architecture Overview](docs/architecture-overview.md)
- [Plugin System](docs/plugin-system.md)
- [Entity Model](docs/entity-model.md)
- [Messaging System](docs/messaging-system.md)
- [Development Workflow](docs/development-workflow.md)
- [Deployment Guide](docs/deployment-guide.md)
- [Tech Stack](docs/tech-stack.md)

## Development

This is a Turborepo monorepo using Bun for package management and runtime.

### Common Commands

```bash
# Install dependencies
bun install

# Run tests across all packages
bun test

# Type check all packages
bun run typecheck

# Lint all packages
bun run lint

# Build all packages
bun run build
```

### Workspace Management

```bash
# Check for dependency version mismatches
bun run deps:check

# Fix dependency version mismatches
bun run deps:fix

# Format all package.json files consistently
bun run deps:format

# Update outdated dependencies
bun run deps:update

# Check workspace package.json files for issues
bun run workspace:check

# Fix workspace package.json issues
bun run workspace:fix

# Visualize the dependency graph
bun run workspace:graph

# Run tests only on packages affected by recent changes
bun run workspace:affected
```

### Package Development

Each package has its own scripts:

```bash
cd packages/shell
bun test          # Run tests
bun run typecheck # Type check
bun run lint      # Lint
```

## Examples

- [Test Brain App](apps/test-brain): Example brain application with CLI and Matrix interfaces
- [Team Brain App](apps/team-brain): Team collaboration instance with custom configuration
- [MCP Interface](interfaces/mcp/): MCP server implementation with stdio and HTTP transports
- [Plugin Examples](plugins/plugin-examples): Example implementations of all plugin types

## Deployment

The application supports multiple deployment strategies:

- **Docker**: Single container or docker-compose orchestration
- **Binary**: Standalone executable compiled with Bun
- **Cloud**: Automated deployment to Hetzner Cloud with Terraform
- **Systemd**: Linux service with automatic startup

See the [Deployment Guide](docs/deployment-guide.md) for detailed instructions.

### Quick Deploy with Docker

```bash
# Build and run with Docker
docker build -t personal-brain .
docker run -d -p 3000:3000 --env-file .env personal-brain

# Or use docker-compose
docker-compose up -d
```

## Contributing

1. Follow the [Development Workflow](docs/development-workflow.md)
2. Write tests for new functionality
3. Ensure all tests pass and types check
4. Submit a pull request

## License

MIT
