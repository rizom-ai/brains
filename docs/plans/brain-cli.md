# Plan: Brain CLI

## Context

The current "CLI" (`interfaces/chat-repl/`) is a chat REPL — an Ink-based interactive terminal where you type messages and an AI agent responds. It's a `MessageInterfacePlugin`, not a command-line tool.

A real CLI is needed for:

- Scaffolding new brain instances (`brain init`)
- Direct operations without agent reasoning (`brain list posts`)
- Scripting and automation (`brain sync && brain build`)

## Design

Two separate things:

- **`brain` CLI** (`packages/brain-cli/`) — command-line tool for operations and instance management.
- **Chat REPL** (`interfaces/chat-repl/`) — the existing Ink-based chat. Launched via `brain chat`.

### Commands

```bash
# Instance management
brain init <dir>                # scaffold brain.yaml + deploy.yml

# Run
brain start                     # run brain (all daemons — MCP, Discord, webserver)
brain chat                      # run brain with interactive chat REPL

# Operations (boot brain, run command, exit — no daemons)
brain status                    # system status
brain list <type>               # list entities by type
brain get <type> <id>           # get entity
brain search <query>            # semantic search
brain create <type>             # create entity
brain sync                      # trigger directory sync
brain build                     # build production site
brain build preview             # build preview site

# Eval
brain eval                      # run evals
brain eval --compare            # compare with previous run
```

### Boot modes

| Command                         | What boots                                                  |
| ------------------------------- | ----------------------------------------------------------- |
| `brain init`                    | Nothing — scaffolds files only                              |
| `brain list/get/sync/build/...` | Full brain, no daemons. Invokes tool, prints result, exits. |
| `brain start`                   | Full brain, all daemons. Long-running.                      |
| `brain chat`                    | Full brain, all daemons + chat REPL attached.               |

Operations use `registerOnly` mode — plugins register tools and entity types, but no events fire and no background services start. Fast startup for command-line operations.

### Schema-driven argument mapping

The CLI derives argument mapping from the tool's `inputSchema` automatically. No custom `mapInput` functions.

- **Positional args** → required schema fields in declaration order
- **Flags** (`--name value`) → optional schema fields by name
- **Defaults** → from Zod schema defaults

```
brain list posts            → inputSchema { entityType: string }
                            → positional[0] → entityType
                            → { entityType: "posts" }

brain get post my-post      → inputSchema { entityType: string, id: string }
                            → positional[0] → entityType, positional[1] → id
                            → { entityType: "post", id: "my-post" }

brain build preview         → inputSchema { environment?: string }
                            → positional[0] → environment
                            → { environment: "preview" }

brain search "deploy"       → inputSchema { query: string, limit?: number }
                            → positional[0] → query, --limit 10 → limit
                            → { query: "deploy", limit: 10 }

brain sync                  → inputSchema {}
                            → no args needed
                            → {}
```

A tool becomes a CLI command by adding one field:

```typescript
cli?: {
  name: string;  // the command name (e.g. "list", "sync", "build")
}
```

That's it. No `mapInput`, no `flags` config. The schema does the work.

### Architecture

Two access modes for operations:

**Local mode** (default): boots brain in `registerOnly` mode, invokes tools directly.

**Remote mode** (`--remote <url>`): connects to a running brain via MCP HTTP.

```bash
brain list posts                          # local — boots brain, reads DB
brain list posts --remote rover.rizom.ai  # remote — queries deployed brain via MCP
```

### `brain init`

Scaffolds a new brain instance. Entry point for [Kamal Deploy](./deploy-kamal.md) Phase 2.

```bash
$ brain init mybrain
? Brain model: rover
? Domain: mybrain.rizom.ai
? Content repo: github:user/mybrain-data

Created:
  mybrain/brain.yaml
  mybrain/deploy.yml
  mybrain/.env.example
  mybrain/.kamal/hooks/pre-deploy
  mybrain/.github/workflows/deploy.yml
```

### `brain start`

Runs the brain with all daemons. Detects monorepo (run from source) vs standalone (run from npm package) automatically.

### Package structure

```
packages/brain-cli/
  src/
    index.ts                   # entry point
    parse-args.ts              # arg parsing
    run-command.ts             # command dispatch
    commands/
      init.ts                  # scaffold new instance
      start.ts                 # run brain + findRunner + requireRunner
      operate.ts               # boot headless, dispatch to tool registry
    lib/
      mcp-client.ts            # MCP HTTP client for remote mode (Phase 3)
  package.json
```

## Steps

### Phase 1: Scaffold and core commands ✅

1. `packages/brain-cli/` package with `bun run brain` convenience script
2. Arg parsing via Node's `util.parseArgs`
3. `brain init <dir>` — scaffolds brain.yaml, deploy.yml, CI, hooks
4. `brain start` — detects monorepo vs standalone, delegates to runner
5. `brain chat` — same as start with chat REPL

### Phase 2: Entity operations ✅

1. `brain list/get/search/sync/build/status` — tool invocation commands
2. Headless `--tool` mode on runner — boots brain without daemons, invokes tool, exits
3. `registerOnly` mode on Shell — fast startup for command discovery

### Phase 2b: Schema-driven CLI commands (in progress)

Tools opt into CLI by adding `cli: { name }`. The CLI auto-maps positional args to schema fields — no `mapInput` functions needed.

```typescript
// Tool definition — just add cli.name
createTool("system", "list", "List entities by type",
  z.object({ entityType: z.string() }),
  listHandler,
  { cli: { name: "list" } },
);

// CLI invocation — schema drives the mapping
brain list posts → { entityType: "posts" }  // positional[0] → first schema field
```

#### How schema-driven mapping works

1. CLI boots in `registerOnly` mode → `getCliTools()` → match by `cli.name`
2. Read tool's `inputSchema` — get field names in declaration order
3. Map positional args to required fields in order
4. Map `--flag value` to optional fields by name
5. Defaults from Zod schema
6. Invoke handler with mapped input

#### Boot + dispatch flow

```
brain <command> [args] [--flags]
  │
  ├── No-boot? (init/start/chat/help/version)
  │   └── Handle directly
  │
  └── Everything else
      └── Boot registerOnly → getCliTools() → match cli.name → schema-map args → invoke → exit
```

#### `brain --help` with dynamic commands

```
brain — CLI for managing brain instances

Commands:
  init <dir>       Scaffold a new brain instance
  start            Start the brain (all daemons)
  chat             Start with interactive chat REPL

Brain commands (rover):
  list <type>      List entities by type
  get <type> <id>  Get a specific entity
  search <query>   Semantic search
  status           Show brain status
  create <type>    Create entity
  sync             Trigger directory sync
  build [env]      Build site (default: production)
```

"Brain commands" only shown when brain.yaml exists in cwd. Without it, only no-boot commands shown.

#### Implementation steps

1. Replace `mapInput` with schema-driven auto-mapping in the runner's CLI command handler
2. Add `cli` metadata to system tools (list, get, search, status, create)
3. Add `cli` metadata to directory-sync sync tool and site-builder build tool
4. Remove all hardcoded tool name mappings from brain-cli

### Phase 3: Remote mode

Query a deployed brain via MCP HTTP — no local brain boot needed.

```bash
brain list posts --remote rover.rizom.ai
brain status --remote rover.rizom.ai --token $TOKEN
```

Uses `@modelcontextprotocol/sdk` client to connect to the brain's `/mcp` endpoint. Schema-driven mapping works the same — system tool names are known (`list` → `system_list`), plugin tools use `brain tool <name> <json> --remote`.

Authentication via `--token` flag or `BRAIN_REMOTE_TOKEN` env var.

### Phase 4: Remaining

1. `brain eval` — wraps eval runner
2. npm publish as `@brains/brain-cli` or `brain`

## Verification

1. `brain init mybrain` scaffolds a deployable instance config
2. `brain start` runs a brain from both monorepo and standalone repo
3. `brain list posts` returns entities without starting daemons
4. `brain build preview` builds preview site
5. `brain sync` triggers sync and returns
6. `brain chat` launches the interactive REPL
7. `brain list posts --remote rover.rizom.ai` works against a deployed brain
8. `brain --help` shows plugin commands when brain.yaml exists
