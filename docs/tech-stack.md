# Brains Tech Stack

## Overview

The Brains project uses a modern, TypeScript-based stack optimized for building an extensible, AI-powered knowledge management system with multiple interfaces.

## Core Runtime & Language

### Runtime Environment

- **[Bun](https://bun.sh/)** - Fast all-in-one JavaScript runtime
  - Replaces Node.js with better performance
  - Built-in TypeScript support
  - Native test runner
  - Fast package manager

### Language & Build

- **[TypeScript](https://www.typescriptlang.org/)** - Primary development language
  - Strict type checking enabled
  - Latest ECMAScript features
  - Workspace-wide configuration

### Monorepo Management

- **[Turborepo](https://turbo.build/)** - High-performance build system
  - Parallel task execution
  - Intelligent caching
  - Workspace management

## Database Layer

### Database

- **[LibSQL](https://github.com/libsql/libsql)** - SQLite fork with extensions
  - Local-first architecture
  - ACID compliance
  - Vector embedding support

### Vector Embeddings

- **Native Vector Storage** - Embeddings stored in SQLite
  - Float32Array columns for embeddings
  - Cosine similarity calculations
  - Semantic search capabilities
  - Content similarity matching

### ORM & Validation

- **[Drizzle ORM](https://orm.drizzle.team/)** - TypeScript ORM
  - Type-safe database queries
  - Migration management
  - Lightweight and performant
- **[Drizzle-Zod](https://orm.drizzle.team/docs/zod)** - Schema validation
  - Runtime type validation
  - Automatic TypeScript types from schemas

## AI & Machine Learning

### AI Models

- **[Anthropic Claude](https://www.anthropic.com/)** - Primary AI model
  - Claude 4 Sonnet model
  - Natural language processing
  - Content generation

### AI Integration

- **[Vercel AI SDK](https://sdk.vercel.ai/)** - AI framework
  - Unified API for AI providers
  - Streaming support
  - Tool calling capabilities

### Embeddings & Similarity

- **Embedding Generation** — OpenAI `text-embedding-3-small`
  - 1536-dimensional vectors
  - Called via Vercel AI SDK (same `AI_API_KEY` as text gen)
  - ~$0.02/M tokens (negligible for personal brains)
- **Vector Storage** — separate `embeddings.db`
  - Decoupled from entity DB for model-swap flexibility
  - libSQL F32_BLOB columns with vector index
  - Attached to entity DB for cross-DB search joins
- **Hybrid Search** — vector + FTS5 keyword
  - 70% semantic + 30% keyword boost
  - SQLite FTS5 virtual table for exact-term matching
  - Threshold tuning via `brain diagnostics search`

## Messaging & Communication

### External Interfaces

### AI Tool Integration

- **[Model Context Protocol (MCP)](https://modelcontextprotocol.io/)** - AI tool standard
  - Tool registration and discovery
  - Standardized AI interactions
  - Resource management

### Internal Messaging

- **Event-driven Architecture** - Pub/sub system
  - Decoupled components
  - Async message passing
  - Job queue integration

## Frontend & UI

### CLI Interface

- **[React](https://react.dev/)** - Component framework
  - Version 19.0.0
  - Functional components with hooks
- **[Ink](https://github.com/vadimdemedes/ink)** - React for CLIs
  - Terminal UI components
  - Interactive CLI applications
  - Built-in input handling

### Web Components

- **[Preact](https://preactjs.com/)** - Lightweight React alternative
  - 3KB runtime
  - Used for static site generation
  - Server-side rendering
- **[Tailwind CSS](https://tailwindcss.com/)** - Utility-first CSS
  - Version 4.0.0
  - JIT compilation
  - Component styling

## Content Processing

### Markdown

- **Primary Storage Format** - All content as Markdown
  - Human-readable
  - Version control friendly
  - Extensible with frontmatter

### Markdown Processing

- **[Gray-matter](https://github.com/jonschlinkert/gray-matter)** - Frontmatter parsing
  - YAML frontmatter support
  - Metadata extraction
- **[Marked](https://marked.js.org/)** - Markdown to HTML
  - GitHub Flavored Markdown
  - Extensible renderer
- **[Remark](https://remark.js.org/)** - Markdown processor
  - AST-based transformations
  - Plugin ecosystem

## Web Server

### Framework

- **[Hono](https://hono.dev/)** - Web framework
  - Lightweight and fast
  - Edge-first design
  - TypeScript native

### Build Tools

- **[Esbuild](https://esbuild.github.io/)** - JavaScript bundler
  - Fast compilation
  - Used for hydration scripts
  - Tree shaking

## Development & Testing

### Testing

- **Bun Test** - Native test runner
  - Built into Bun runtime
  - Jest-compatible API
  - Fast execution

### Code Quality

- **[ESLint](https://eslint.org/)** - Linting
  - Custom rule configuration
  - TypeScript support
  - Workspace-wide rules
- **[Prettier](https://prettier.io/)** - Code formatting
  - Automatic formatting
  - Consistent code style
  - Pre-commit hooks

### Git Hooks

- **[Husky](https://typicode.github.io/husky/)** - Git hooks management
  - Pre-commit formatting
  - Test execution
  - Commit message validation

## Infrastructure & Deployment

### Containerization

- **[Docker](https://www.docker.com/)** - Container platform
  - Multi-stage builds
  - Development environments
  - Production deployment

### CI/CD

- **[GitHub Actions](https://github.com/features/actions)** - Automation
  - Continuous integration
  - Automated testing
  - Deployment pipelines

### Infrastructure as Code

- **[Terraform](https://www.terraform.io/)** - IaC tool
  - Hetzner Cloud provider
  - Declarative infrastructure
  - State management

## Architectural Patterns

### Plugin Architecture

- **Extensible Core** - Plugin-based system
  - BasePlugin → ServicePlugin → ServicePlugin/InterfacePlugin
  - Hot-reloadable plugins
  - Isolated plugin contexts

### Data Management

- **Entity Model** - Unified data abstraction
  - Markdown-based storage
  - Type-safe adapters
  - Extensible metadata
  - Vector embeddings for semantic search

### Async Processing

- **Job Queue System** - Background tasks
  - Batch operations
  - Progress tracking
  - Error handling
  - Embedding generation jobs

### Command System

- **Command Registry** - Centralized handling
  - Permission-based access
  - Schema validation
  - Multi-interface support

## Package Structure

### Core Packages

- `@brains/core` - Shell orchestrator
- `@brains/app` - Application factory
- `@brains/plugins` - Plugin infrastructure

### Service Packages

- `@brains/ai-service` - AI integration (text/object generation, online embeddings)
- `@brains/entity-service` - Entity management, search, embedding DB
- `@brains/job-queue` - Async job processing
- `@brains/messaging-service` - Event system

### Interface Packages

- `@brains/chat-repl` - Interactive chat REPL
- `@brains/mcp` - Model Context Protocol interface
- `@brains/webserver` - Web server interface

### Shared Packages

- `@brains/utils` - Logger, markdown, permissions, progress, Zod re-export
- `@brains/ui-library` - Preact UI components
- `@brains/test-utils` - Mock factories, test harnesses
- `@brains/mcp-bridge` - Base class for upstream MCP integration
- `@brains/theme-*` - CSS themes (10 themes)

## Version Requirements

- **Bun**: >=1.3.3
- **TypeScript**: >=5.3.3
- **Node.js**: >=20.0.0 (runtime compatibility checks for CLI)

## Key Features

- **Local-first content** - Markdown files as source of truth, git sync
- **Hybrid search** - Vector embeddings (OpenAI) + FTS5 keyword matching
- **Multi-interface support** - CLI, Discord, MCP, A2A, Webserver
- **AI-powered** - Configurable provider (OpenAI, Anthropic, Google) via `AI_API_KEY`
- **Extensible** - Plugin system for custom entity types, services, interfaces
- **Type-safe** - End-to-end TypeScript with Zod validation
- **Real-time** - Event-driven messaging system
- **Scalable** - Monorepo structure with independent packages
