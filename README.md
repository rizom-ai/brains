# Rizom Brains

A modular, extensible knowledge management system built on the Model Context Protocol (MCP)

---

## What is Rizom Brains?

Every brain is an **MCP server** that exposes tools and resources for AI assistants to help manage your knowledge

Built for extensibility and AI-first workflows

---

## Core Features

**Unified Entity Model**
Store notes, tasks, profiles, and custom entity types

**Markdown-First Storage**
All content stored as markdown with YAML frontmatter

---

## More Features

**Vector Search**
Semantic search powered by local embeddings

**Git Sync**
Version control and synchronization for your knowledge base

---

## Extensibility & Access

**Plugin Architecture**
Extend with custom entity types and features

**Multiple Interfaces**
CLI, Matrix bot, or direct MCP connection

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/rizom-ai/brains.git
cd brains
bun install

# Build and run
bun run build
cd apps/test-brain
bun run dev
```

---

## Create Your Own Brain

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

---

## Architecture

**Tool-First Design**

All functionality exposed through MCP tools and resources

Everything is accessible to AI assistants

---

## Core Services

**Entity Management**

- @brains/entity-service: CRUD with vector search
- @brains/embedding-service: Text embeddings

**AI & Content**

- @brains/ai-service: Text generation (Anthropic)
- @brains/content-service: Template-based content

---

## More Services

**Processing & Jobs**

- @brains/job-queue: Background processing
- @brains/messaging-service: Event pub/sub

**Orchestration**

- @brains/core: Plugin management
- @brains/mcp-service: MCP server

---

## Interfaces

**@brains/cli**
Interactive command-line interface

**@brains/matrix**
Matrix bot with E2E encryption

**@brains/mcp**
MCP transport (stdio and HTTP)

---

## Plugins

**@brains/directory-sync**
Import/export entities to file system

**@brains/git-sync**
Sync entities with Git repositories

**@brains/link**
Web content capture with AI extraction

---

## More Plugins

**@brains/site-builder**
Static site generation (Preact/Tailwind)

**@brains/summary**
AI-powered summarization and digests

**@brains/topics**
AI-powered topic extraction

---

## Key Concepts

**Entities**
Everything is an entity with type, title, content, tags

**Adapters**
Convert between entities and markdown

---

## More Concepts

**Plugins**
Extend functionality with tools, resources, entity types

**Formatters**
Control how data is displayed in different contexts

---

## Documentation

[Architecture Overview](docs/architecture-overview.md)
[Plugin System](docs/plugin-system.md)
[Entity Model](docs/entity-model.md)

[Development Workflow](docs/development-workflow.md)
[Deployment Guide](docs/deployment-guide.md)

---

## Development

Turborepo monorepo using **Bun**

```bash
# Install and build
bun install
bun run build

# Test and validate
bun test
bun run typecheck
bun run lint
```

---

## Workspace Management

```bash
# Check dependencies
bun run deps:check

# Fix workspace issues
bun run workspace:fix

# Visualize dependency graph
bun run workspace:graph
```

---

## Deployment Options

**Docker**
Single container or docker-compose

**Binary**
Standalone executable with Bun

**Cloud**
Automated deployment with Terraform

---

## Quick Deploy

```bash
# Docker
docker build -t personal-brain .
docker run -d -p 3000:3000 --env-file .env personal-brain

# Or docker-compose
docker-compose up -d
```

---

## Get Started

1. Clone the repository
2. Follow the [Development Workflow](docs/development-workflow.md)
3. Check out the [examples](apps/test-brain)
4. Build something amazing!

---

## License

MIT
