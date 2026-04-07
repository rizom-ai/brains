# @brains/app

Application orchestration and lifecycle management for Brain applications.

## Overview

The `@brains/app` package is the runtime engine that the `brain` CLI (`@rizom/brain`) uses to boot a brain. It exposes:

- `defineBrain()` — declarative brain model definition (capabilities, interfaces, presets, identity, permissions)
- `handleCLI()` — CLI entrypoint that resolves a `brain.yaml` against a brain model and runs it
- The `brain-resolver` that merges `(definition, env, brain.yaml overrides)` into a runnable `AppConfig`
- The `App` class that manages init, plugin loading, daemon startup, and graceful shutdown

End users do not import `@brains/app` directly. They write a `brain.yaml` and run `brain start`.

## Architecture

```
App (Main orchestrator)
├── MigrationManager (Database migrations)
├── SeedDataManager (Initial brain-data setup)
└── Shell (Plugin & service management)
    ├── EntityPlugins
    ├── ServicePlugins
    └── InterfacePlugins
```

### Initialization Flow

1. **Resolve** — `brain-resolver` loads `brain.yaml`, dynamically imports the referenced brain model package, applies preset + add/remove + per-plugin overrides, and produces an `AppConfig`
2. **Migrate** — Run database migrations for the entity DB, embedding DB, job-queue DB, and conversation DB
3. **Seed** — Copy `seed-content/` into `brain-data/` if the directory is empty
4. **Initialize** — Create the Shell, register plugins in dependency order, instantiate interfaces
5. **Start** — Boot daemons (webserver, MCP transport, Discord, A2A) and install signal handlers

## Defining a Brain Model

Brain models live in `brains/<model>/src/index.ts` and use `defineBrain()`:

```typescript
import { defineBrain, type BrainEnvironment } from "@brains/app";
import { MCPInterface } from "@brains/mcp";
import { WebserverInterface } from "@brains/webserver";
import { directorySync } from "@brains/directory-sync";
// ... more capability imports

export default defineBrain({
  name: "my-brain",
  version: "1.0.0",

  identity: {
    characterName: "Atlas",
    role: "Knowledge manager",
    purpose: "Organize and surface knowledge",
    values: ["clarity", "accuracy"],
  },

  capabilities: [
    // [id, factory, config | envMapper] tuples
    [
      "directory-sync",
      directorySync,
      (env: BrainEnvironment) => ({
        authToken: env["GIT_SYNC_TOKEN"],
        autoSync: true,
      }),
    ],
    // ...
  ],

  interfaces: [
    // [id, constructor, envMapper] tuples
    ["mcp", MCPInterface, (env) => ({ authToken: env["MCP_AUTH_TOKEN"] })],
    ["webserver", WebserverInterface, () => ({})],
  ],

  presets: {
    core: ["mcp", "webserver", "directory-sync"],
    default: ["mcp", "webserver", "directory-sync", "blog", "site-builder"],
    full: [
      "mcp",
      "webserver",
      "discord",
      "a2a",
      "directory-sync",
      "blog" /* ... */,
    ],
  },

  permissions: {
    anchors: ["discord:123456789"],
    rules: [
      { pattern: "cli:*", level: "anchor" },
      { pattern: "mcp:stdio", level: "anchor" },
    ],
  },
});
```

See `brains/rover/src/index.ts` for the full reference implementation.

## Running a Brain

Brain instances are config-only directories (`brain.yaml` + `.env`) consumed at runtime by the `brain` CLI from `@rizom/brain`:

```bash
# Install once
bun add -g @rizom/brain

# Run from any instance directory
cd apps/yeehaa.io
brain start                # MCP stdio (default)
brain start --cli          # attach the chat REPL
brain init mybrain         # scaffold a new instance directory
brain init mybrain --deploy   # scaffold + Kamal deploy.yml + CI workflow
brain diagnostics search
brain diagnostics usage
```

The CLI resolves `brain.yaml`, dynamically imports the brain model package it references, and calls `handleCLI(config)` internally. Instances do not have a `package.json` of their own.

## Environment Variables

The brain runtime reads only secrets from `.env`. Non-secret config (domain, ports, repos, plugin overrides) belongs in `brain.yaml`.

```env
# Required
AI_API_KEY=your-api-key-here

# Optional: separate key for image generation (defaults to AI_API_KEY)
# AI_IMAGE_KEY=

# Optional integrations
GIT_SYNC_TOKEN=ghp_...
MCP_AUTH_TOKEN=...
DISCORD_BOT_TOKEN=...
CLOUDFLARE_API_TOKEN=...
```

The single `AI_API_KEY` works for OpenAI / Anthropic / Google — provider is auto-detected from the model name. Default model is `gpt-4.1` (OpenAI).

## API

### `defineBrain(definition)`

Declarative brain model factory. Returns the canonical `BrainDefinition` consumed by the resolver.

### `handleCLI(config)`

CLI entrypoint. Parses `process.argv`, dispatches to the requested interface, manages signal handlers and graceful shutdown.

### `brain-resolver`

`resolveBrain(definition, env, overrides) → AppConfig`. Internal but exported for testing.

### `App` class

- `App.create(config)` — factory
- `initialize()` — run migrations, seed data, register plugins
- `start()` — boot daemons + install signal handlers
- `stop()` — graceful shutdown
- `getShell()` — access the underlying Shell instance

## Plugin Loading Order

Plugins are loaded in dependency order:

1. **EntityPlugins** — register entity types, adapters, generation handlers, derivers
2. **ServicePlugins** — register tools, job handlers, API routes, daemons
3. **InterfacePlugins** — start daemons (MCP transport, webserver, Discord, A2A)

System tools, resources, and prompts are registered directly by the shell, not by a plugin (since 2026-03's "system tools as framework" refactor).

## See Also

- `docs/brain-model.md` — brain model + instance architecture
- `docs/architecture-overview.md` — workspace structure and shell packages
- `packages/brain-cli/` — `@rizom/brain` published CLI
- `brains/rover/src/index.ts` — reference brain model implementation
