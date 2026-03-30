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

```typescript
// In a plugin's onRegister():
context.registerCommand({
  name: "sync",
  description: "Trigger directory sync",
  toolName: "directory-sync_sync",
  args: [], // no positional args
  flags: {}, // no flags
});

context.registerCommand({
  name: "build",
  description: "Build site",
  toolName: "site-builder_build-site",
  flags: { preview: { type: "boolean", description: "Build preview site" } },
});
```

The brain CLI:

1. Boots brain headless
2. Collects registered commands from all plugins
3. Matches the user's command to a registered command
4. Invokes the corresponding tool

Built-in commands (always available, regardless of plugins):

- `list`, `get`, `search`, `status`, `create` — system tools
- `init`, `start`, `chat` — CLI-only, no tool invocation

Plugin commands (only available when the plugin is loaded):

- `sync` — directory-sync plugin
- `build` — site-builder plugin
- Any future plugin-specific operations

`brain --help` shows both built-in and plugin-registered commands.

### Phase 3: Remote mode

1. MCP HTTP client — connect to running brain
2. `--remote <url>` flag on all operation commands
3. Authentication (bearer token or DID-based)

### Phase 4: Chat and eval integration

1. `brain chat` — ✅ done (launches existing chat REPL)
2. `brain eval` — wraps eval runner
3. Rename `interfaces/cli/` to `interfaces/chat-repl/` — ✅ done

### Phase 5: Plugin-registered commands (Phase 2b)

1. Add `registerCommand()` to plugin context
2. Command registry on Shell — collects commands from all plugins during boot
3. Brain CLI queries registry after headless boot
4. Replace hardcoded `sync`, `build` with plugin-registered versions
5. `brain --help` shows discovered commands dynamically

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
