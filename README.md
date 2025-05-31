# Personal Brain

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
git clone https://github.com/yeehaa123/brains.git
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

- **@brains/shell**: Core infrastructure (database, entities, search, plugins)
- **@brains/app**: High-level app framework with CLI and Matrix interfaces
- **@brains/mcp-server**: MCP protocol implementation
- **@brains/git-sync**: Git synchronization plugin
- **@brains/base-entity**: Base entity adapter and formatter
- **@brains/types**: Shared TypeScript types
- **@brains/utils**: Common utilities

### Key Concepts

1. **Entities**: Everything is an entity with a type, title, content, and tags
2. **Adapters**: Convert between entities and markdown for storage
3. **Plugins**: Extend functionality by adding tools, resources, and entity types
4. **Formatters**: Control how data is displayed in different contexts

## Documentation

- [Architecture Overview](docs/architecture-overview.md)
- [Plugin System](docs/plugin-system.md)
- [Entity Model](docs/entity-model.md)
- [Development Workflow](docs/development-workflow.md)

## Development

This is a Turborepo monorepo using Bun for package management and runtime.

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

### Package Development

Each package has its own scripts:

```bash
cd packages/shell
bun test          # Run tests
bun run typecheck # Type check
bun run lint      # Lint
```

## Examples

- [Test Brain App](apps/test-brain): Example brain application
- [Note Context Plugin](docs/examples/note-context): Example context plugin

## Contributing

1. Follow the [Development Workflow](docs/development-workflow.md)
2. Write tests for new functionality
3. Ensure all tests pass and types check
4. Submit a pull request

## License

MIT
