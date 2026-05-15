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

- **Configurable** — single `AI_API_KEY` env var, provider auto-detected from model name
  - Default text model: **`gpt-4.1`** (OpenAI)
  - Supported providers: OpenAI, Anthropic (Claude), Google (Gemini)
  - Default embedding model: **`text-embedding-3-small`** (OpenAI)
  - Optional separate `AI_IMAGE_KEY` for image generation

### AI Integration

- **[Vercel AI SDK](https://sdk.vercel.ai/)** - AI framework
  - Unified API for OpenAI / Anthropic / Google
  - Streaming support
  - Tool calling capabilities
  - Provider auto-resolution from model id

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

- **CLI** — in-process REPL via `interfaces/chat-repl` (Ink)
- **MCP** — stdio + HTTP transports via `interfaces/mcp`
- **Webserver** — in-process Hono via `Bun.serve`, serving site pages, dashboard/CMS routes, browser-facing APIs, and `/health`
- **Discord** — bot interface via `interfaces/discord` (moving to Chat SDK long-term)
- **A2A** — agent-to-agent JSON-RPC via `interfaces/a2a` (Agent Card, non-blocking tasks)

### AI Tool Integration

- **[Model Context Protocol (MCP)](https://modelcontextprotocol.io/)** - AI tool standard
  - Tool registration and discovery
  - Standardized AI interactions
  - Resources, resource templates, prompts

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
  - Used by build scripts and package bundling
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
  - Multi-stage builds via `Dockerfile.model`
  - Multi-arch images (amd64 + arm64) published to GHCR
  - Development environments
  - Production deployment

### CI/CD

- **[GitHub Actions](https://github.com/features/actions)** - Automation
  - Continuous integration (typecheck, test, lint)
  - Multi-arch image publishing (`publish-images.yml`, fork-safe)
  - Changesets release workflow (`@rizom/brain` to npm)
  - Deployment pipelines

### Deployment

- **[Kamal](https://kamal-deploy.org/)** — default deploy tool
  - Hetzner Cloud as the default provider
  - Per-instance `config/deploy.yml` scaffolded by `brain init <dir> --deploy`
  - App serves production and preview hosts directly; `/health` endpoint for healthchecks
  - Cloudflare Origin CA via `brain cert:bootstrap`; secrets via `brain secrets:push` (GitHub Actions or Bitwarden Secrets Manager)
  - Multi-user fleets via `@rizom/ops`
- **[Terraform](https://www.terraform.io/)** — legacy IaC under `deploy/providers/hetzner/terraform/`, retained but no longer the primary path

## Architectural Patterns

### Plugin Architecture

- **Three sibling plugin types** with isolated contexts:
  - **EntityPlugin** — content types (schema, adapter, generation handler, projection declarations); zero tools
  - **ServicePlugin** — integrations (tools, job handlers, API routes, daemons)
  - **InterfacePlugin** — transports (MCP, Discord, A2A, webserver, CLI)
- **Composite plugins** — factories may return `Plugin | Plugin[]`, letting one capability id register multiple sub-plugins (e.g. `@brains/newsletter` bundles entity + service)
- **Brain models** declare `[id, factory, config]` capability tuples; presets (`core`/`default`/`full`) curate which capabilities are active per instance

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

### Core Shell Packages (`shell/*`)

- `@brains/app` — brain resolver, CLI entrypoint, `defineBrain()`, `brain.yaml` parsing
- `@brains/core` — central shell with plugin lifecycle and registries
- `@brains/plugins` — plugin base classes (EntityPlugin, ServicePlugin, InterfacePlugin), three sibling contexts
- `@brains/ai-service` — AI agent + xstate conversation state machine + `ai:usage` logging
- `@brains/entity-service` — entity CRUD, mutations, hybrid search, embedding DB
- `@brains/identity-service` — brain character + anchor profile management
- `@brains/conversation-service` — conversation and message memory
- `@brains/content-service` — template-based content generation
- `@brains/job-queue` — async job processing with progress tracking
- `@brains/mcp-service` — tool / resource / template / prompt registration
- `@brains/messaging-service` — event-driven pub/sub
- `@brains/templates` — template registry
- `@brains/ai-evaluation` — eval runner, test cases, LLM judge

### Published Packages (`packages/*`)

- `@rizom/brain` (`packages/brain-cli`) — published CLI: `brain init`, `brain start`, `brain diagnostics`, `brain eval`, `brain pin`, `brain secrets:push`, `brain cert:bootstrap`, `brain ssh-key:bootstrap`. Bundles the runtime while `brain init` scaffolds instance-local support files such as `package.json`, `tsconfig.json`, and optional deploy artifacts.
- `@rizom/ops` (`packages/brains-ops`) — operator CLI for rover-pilot fleets: wildcard TLS bootstrap, age-encrypted per-user secrets, content repo auto-create, multi-user deploy management.

### Interface Packages (`interfaces/*`)

- `@brains/chat-repl` — interactive Ink-based REPL
- `@brains/mcp` — MCP transport (stdio + HTTP)
- `@brains/webserver` — in-process Hono webserver for site pages, dashboard/CMS routes, browser-facing APIs, and `/health`
- `@brains/discord` — Discord bot interface
- `@brains/a2a` — agent-to-agent JSON-RPC interface (Agent Card, non-blocking tasks)

### Shared Packages (`shared/*`)

- `@brains/utils` — Logger (JSON mode + log file), markdown, YAML, IDs, permissions, progress, Zod re-export (overloaded; split tracked separately)
- `@brains/ui-library` — Preact UI components (Header, Footer, ThemeToggle, widgets)
- `@rizom/ui` (`shared/rizom-ui`) — Rizom-brand UI primitives shared across app-owned Rizom site variants
- `@brains/site-engine` — renderer-agnostic site build engine utilities
- `@brains/site-composition` — shared site composition contract and merge helpers
- `@brains/test-utils` — mock factories, test harnesses, MockShell
- `@brains/mcp-bridge` — base class for bridging upstream MCP servers
- `@brains/image` — image schema, adapter, utilities
- `@brains/cms-config` — CMS config types consumed by the `cms` plugin
- `@brains/product-site-content` — product page layouts and templates
- `@brains/deploy-support` — canonical deploy templates, deploy script helpers, env parsing, and cert support
- `@brains/theme-base` / `@brains/theme-default` / `@brains/theme-rizom` — shared CSS themes
- `@brains/eslint-config` / `@brains/typescript-config` — shared lint and TS configs

## Version Requirements

- **Bun**: >=1.3.3
- **TypeScript**: >=5.3.3
- **Node.js**: >=20.0.0 (runtime compatibility checks for CLI)

## Key Features

- **Local-first content** — Markdown files as source of truth, git-backed sync via `directory-sync`
- **Hybrid search** — vector embeddings (OpenAI) + FTS5 keyword matching, threshold-tuned
- **Multi-interface support** — CLI, Chat REPL, Discord, MCP, A2A, Webserver
- **AI-powered** — single `AI_API_KEY`, provider auto-detected from model name (OpenAI / Anthropic / Google)
- **Extensible** — EntityPlugin / ServicePlugin / InterfacePlugin + composite factories
- **Type-safe** — end-to-end TypeScript with Zod validation
- **Observable** — structured JSON logs, enriched `/health` endpoint, `ai:usage` tracking
- **Lightweight instance packages** — deployments are centered on `brain.yaml`, with minimal per-instance support files (`.env`, `.env.example`, `.gitignore`, `tsconfig.json`, `package.json`, optional deploy artifacts) rather than full custom apps
