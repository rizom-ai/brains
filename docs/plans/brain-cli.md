# Plan: Brain CLI

## Context

The current "CLI" (`interfaces/cli/`) is a chat REPL — an Ink-based interactive terminal where you type messages and an AI agent responds. It's a `MessageInterfacePlugin`, not a command-line tool.

A real CLI is needed for:

- Scaffolding new brain instances (`brain init`)
- Direct operations without agent reasoning (`brain list posts`)
- Scripting and automation (`brain sync && brain build`)
- Development workflow (`brain dev`)

## Design

Two separate things:

- **`brain` CLI** — command-line tool for operations and instance management. New package.
- **Chat REPL** — the existing Ink-based chat. Stays as `interfaces/cli/`, becomes `brain chat`.

### Commands

```bash
# Instance management
brain init                      # scaffold brain.yaml + deploy.yml in cwd
brain init --model rover        # use specific brain model

# Run
brain start                     # run brain (all daemons — MCP, Discord, webserver)
brain chat                      # run brain with interactive chat REPL

# Operations (boot brain, run command, exit — no daemons)
brain status                    # system status
brain list <type>               # list entities by type
brain get <type> <id>           # get entity
brain search <query>            # semantic search
brain create <type> --prompt "..." # create entity
brain sync                      # trigger directory sync
brain build                     # build site
brain build --preview           # build preview site

# Eval
brain eval                      # run evals (replaces bun run eval)
brain eval --compare            # compare with previous run
```

### Boot modes

| Command                         | What boots                                                  |
| ------------------------------- | ----------------------------------------------------------- |
| `brain init`                    | Nothing — scaffolds files only                              |
| `brain list/get/sync/build/...` | Full brain, no daemons. Invokes tool, prints result, exits. |
| `brain start`                   | Full brain, all daemons. Long-running.                      |
| `brain chat`                    | Full brain, all daemons + chat REPL attached.               |

Operations boot the full brain without daemons (no MCP server, no Discord, no webserver). Plugins load, entity service connects, job handlers register — but no interfaces start. Same principle as `mode: eval`. The command invokes the relevant tool directly, prints the result, and exits.

### Architecture

Two access modes for operations:

**Local mode** (default): boots brain in-process, invokes tools directly.

**Remote mode** (`--remote <url>`): connects to a running brain via MCP HTTP. For operations on deployed instances.

```bash
brain list posts                          # local — boots brain, reads DB
brain list posts --remote rover.rizom.ai  # remote — queries deployed brain via MCP
```

### `brain init`

Scaffolds a new brain instance. Entry point for [Kamal Deploy](./deploy-kamal.md) Phase 2.

```bash
$ brain init
? Brain model: rover
? Domain: mybrain.rizom.ai
? Content repo: github:user/mybrain-data

Created:
  brain.yaml          # instance config
  deploy.yml          # Kamal deploy config
  .env.example        # secrets template
  .kamal/hooks/pre-deploy  # brain.yaml upload hook
  .github/workflows/deploy.yml  # CI pipeline
```

Reads available brain models from the npm registry (or GHCR). Interactive prompts for configuration. Generates all files needed for standalone deployment.

### `brain start`

Runs the brain with all daemons. Works from both monorepo (source) and standalone repo (npm package) — detects the context automatically.

```bash
brain start                     # default preset
brain start --preset minimal    # specific preset
```

### Package structure

```
packages/brain-cli/            # or shell/brain-cli/
  src/
    index.ts                   # entry point, arg parsing
    commands/
      init.ts                  # scaffold new instance
      start.ts                 # run brain (detects monorepo vs npm)
      status.ts                # system status
      list.ts                  # list entities
      get.ts                   # get entity
      search.ts                # search
      create.ts                # create entity
      sync.ts                  # directory sync
      build.ts                 # site build
      chat.ts                  # launch chat REPL (delegates to interfaces/cli)
      eval.ts                  # run evals
    lib/
      brain-connection.ts      # local or remote brain access
      mcp-client.ts            # MCP HTTP client for remote mode
  package.json
```

### Relationship to existing CLI

The existing `interfaces/cli/` (Ink chat REPL) stays as-is. `brain chat` launches it. The new CLI is a separate package that can invoke the chat REPL as a subcommand.

Over time, `interfaces/cli/` could be renamed to `interfaces/chat-repl/` for clarity.

## Steps

### Phase 1: Scaffold and core commands ✅

1. `packages/brain-cli/` package with `bun run brain` convenience script
2. Arg parsing via Node's `util.parseArgs`
3. `brain init <dir>` — scaffolds brain.yaml, deploy.yml, CI, hooks
4. `brain start` — detects monorepo vs standalone, delegates to runner
5. `brain chat` — same as start with chat REPL
6. Publish as `@brains/cli` or `brain` on npm (not yet)

### Phase 2: Entity operations ✅

1. `brain list <type>` — invokes `system_list` tool
2. `brain get <type> <id>` — invokes `system_get` tool
3. `brain search <query>` — invokes `system_search` tool
4. `brain sync` — invokes `directory-sync_sync` tool
5. `brain build` — invokes `site-builder_build-site` tool
6. `brain status` — invokes `system_status` tool
7. Headless `--tool` mode on runner — boots brain without daemons, invokes tool, exits

Currently hardcoded tool names. Works for rover (which has all plugins). See Phase 5 for plugin-registered commands.

### Phase 2b: Plugin-registered CLI commands

The current entity operations hardcode tool names (`directory-sync_sync`, `site-builder_build-site`). This breaks for brain models that don't have those plugins.

**Fix:** Plugins register CLI commands during boot. The brain CLI discovers them.

#### Design: CLI metadata on tools

No separate command registry. Tools already get registered — add optional `cli` metadata to make them invocable from the CLI.

```typescript
interface Tool {
  name: string;
  description: string;
  inputSchema: ZodRawShape;
  handler: (input, context) => Promise<ToolResponse>;
  visibility?: ToolVisibility;
  cli?: {
    name: string; // "list", "sync", "build"
    mapInput: (
      args: string[],
      flags: Record<string, unknown>,
    ) => Record<string, unknown>;
  };
}
```

`cli.mapInput` translates CLI args/flags into tool input. Each tool knows how its own CLI invocation maps to its input schema.

Not every tool is a CLI command — only tools with `cli` defined. The CLI boots, filters tools that have `cli`, matches by `cli.name`.

#### Examples

```typescript
// system tool (shell/core/src/system/tools.ts)
{
  name: "system_list",
  description: "List entities by type",
  inputSchema: { entityType: z.string() },
  handler: listHandler,
  cli: {
    name: "list",
    mapInput: (args) => ({ entityType: args[0] }),
  },
}

// directory-sync plugin tool
{
  name: "directory-sync_sync",
  description: "Trigger directory sync",
  inputSchema: {},
  handler: syncHandler,
  cli: {
    name: "sync",
    mapInput: () => ({}),
  },
}

// site-builder plugin tool
{
  name: "site-builder_build-site",
  description: "Build site",
  inputSchema: { environment: z.string() },
  handler: buildHandler,
  cli: {
    name: "build",
    mapInput: (_args, flags) => ({
      environment: flags["preview"] ? "preview" : "production",
    }),
  },
}
```

#### Boot + dispatch flow

The CLI always boots headless first, then dispatches:

```
brain <command> [args] [--flags]
  │
  ├── No-boot command? (init/start/chat/help/version)
  │   └── Handle directly, no brain boot
  │
  └── Everything else
      └── Boot headless → getCliTools() → match by cli.name → mapInput → invoke → print → exit
          (if not found: "Unknown command. Available: list, get, search, sync, build, ...")
```

All commands with `cli` metadata follow the same path — system or plugin. `brain sync` on a brain without directory-sync boots, finds no "sync" in the registry, shows available commands.

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
  build            Build site (--preview for preview)
```

The "Brain commands" section is only shown when brain.yaml exists in cwd (boots headless to discover them). Without brain.yaml, only no-boot commands are shown.

#### No-boot vs registry

Two categories:

**No-boot commands** (handled by CLI directly, no brain needed):

- `init`, `start`, `chat`, `help`, `version`

**Tool commands** (require brain boot, discovered via `cli` metadata on tools):

- System: `list`, `get`, `search`, `status`, `create` — system tools with `cli` field
- Plugin: `sync`, `build`, etc. — plugin tools with `cli` field

One pattern, one code path. The CLI doesn't know or care whether a tool comes from the system or a plugin — it boots, gets CLI-enabled tools, matches, invokes.

#### No new API needed

Plugins already register tools via `createTool()`. Adding `cli` is just an optional field on the tool definition. No new context method, no separate registry.

#### Implementation steps

1. Add optional `cli` field to `Tool` type in `@brains/mcp-service`
2. Add `cli` metadata to system tools (list, get, search, status, create)
3. Add `cli` metadata to directory-sync sync tool and site-builder build tool
4. Add `getCliTools()` to `IMCPService` — returns tools where `cli` is defined
5. Update brain-cli: boot → `getCliTools()` → match by `cli.name` → `mapInput` → invoke handler
6. Update `--help` to show CLI-enabled tools when brain.yaml exists
7. Remove `buildToolCall`, `operate.ts` and all hardcoded tool names from brain-cli

### Phase 3: Remote mode

1. MCP HTTP client — connect to running brain
2. `--remote <url>` flag on all operation commands
3. Authentication (bearer token or DID-based)

### Phase 4: Chat and eval integration

1. `brain chat` — ✅ done (launches existing chat REPL)
2. `brain eval` — wraps eval runner
3. Rename `interfaces/cli/` to `interfaces/chat-repl/` — ✅ done

### Phase 5: Remaining items

1. `brain eval` — wraps eval runner
2. npm publish as `@brains/brain-cli` or `brain`

## Files affected

| Phase | Files | Nature                                             |
| ----- | ----- | -------------------------------------------------- |
| 1     | ~10   | New package, arg parser, init command, dev command |
| 2     | ~8    | Entity operation commands, tool invocation         |
| 3     | ~3    | MCP client, remote flag                            |
| 4     | ~5    | Chat/eval wrappers, rename                         |

## Verification

1. `brain init` scaffolds a deployable instance config
2. `brain start` runs a brain from both monorepo and standalone repo
3. `brain list posts` returns entities without starting daemons
4. `brain sync` triggers sync and returns
5. `brain chat` launches the interactive REPL
6. `brain list posts --remote rover.rizom.ai` works against a deployed brain
7. `brain eval` runs evals with correct reporting
