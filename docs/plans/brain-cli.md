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
brain dev                       # run brain from monorepo source
brain start                     # run brain from installed npm package

# Operations (direct tool invocation, no agent)
brain status                    # system status
brain list <type>               # list entities by type
brain get <type> <id>           # get entity
brain search <query>            # semantic search
brain create <type> --prompt "..." # create entity
brain sync                      # trigger directory sync
brain build                     # build site
brain build --preview           # build preview site

# Chat
brain chat                      # start interactive chat REPL (current CLI)

# Eval
brain eval                      # run evals (replaces bun run eval)
brain eval --compare            # compare with previous run
```

### Architecture

The CLI is a standalone tool, not an InterfacePlugin. It doesn't boot a full brain for simple operations — it connects to a running brain via MCP HTTP or invokes tools directly.

Two modes:

**Local mode** (default): boots a minimal brain in-process, invokes tools directly. For `brain list`, `brain sync`, `brain build`, etc. Fast startup — only loads the plugins needed for the command.

**Remote mode** (`--remote <url>`): connects to a running brain via MCP HTTP. For operations on deployed instances.

```bash
brain list posts                          # local — reads from local brain-data
brain list posts --remote rover.rizom.ai  # remote — queries deployed brain
```

### `brain init`

Scaffolds a new brain instance. This is the entry point for [Kamal Deploy](./deploy-kamal.md) Phase 2 — creating standalone instance repos.

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

Reads available brain models from the npm registry (or GHCR). Interactive prompts for configuration. Generates all files needed for standalone deployment. See [deploy-kamal.md](./deploy-kamal.md) for the deploy.yml structure and CI pipeline details.

### `brain dev`

Development mode for the monorepo:

```bash
$ cd brains/rover
$ brain dev                    # starts rover with default preset
$ brain dev --preset minimal   # starts with minimal preset
$ brain dev --brain-yaml /path/to/brain.yaml  # custom config
```

Replaces the current `bun run` approach in the monorepo. Reads brain model from the current directory, resolves plugins, starts the brain.

### Package structure

```
packages/brain-cli/            # or shell/brain-cli/
  src/
    index.ts                   # entry point, arg parsing
    commands/
      init.ts                  # scaffold new instance
      dev.ts                   # development mode
      start.ts                 # production mode (from npm package)
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

### Phase 1: Scaffold and core commands

1. Create `packages/brain-cli/` package
2. Arg parsing (`brain <command> [args] [--flags]`)
3. `brain init` — interactive scaffolding
4. `brain dev` — development mode (wraps current brain runner)
5. `brain status` — connect to local brain, show status
6. Publish as `@brains/cli` or `brain` on npm

### Phase 2: Entity operations

1. `brain list <type>` — invokes `system_list` tool
2. `brain get <type> <id>` — invokes `system_get` tool
3. `brain search <query>` — invokes `system_search` tool
4. `brain create <type>` — invokes `system_create` tool
5. `brain sync` — invokes `directory-sync_sync` tool
6. `brain build` — invokes `site-builder_build-site` tool

### Phase 3: Remote mode

1. MCP HTTP client — connect to running brain
2. `--remote <url>` flag on all operation commands
3. Authentication (bearer token or DID-based)

### Phase 4: Chat and eval integration

1. `brain chat` — launches existing Ink REPL
2. `brain eval` — wraps eval runner
3. Rename `interfaces/cli/` to `interfaces/chat-repl/`

## Files affected

| Phase | Files | Nature                                             |
| ----- | ----- | -------------------------------------------------- |
| 1     | ~10   | New package, arg parser, init command, dev command |
| 2     | ~8    | Entity operation commands, tool invocation         |
| 3     | ~3    | MCP client, remote flag                            |
| 4     | ~5    | Chat/eval wrappers, rename                         |

## Verification

1. `brain init` scaffolds a deployable instance config
2. `brain dev` starts a brain from the monorepo
3. `brain list posts` returns entities without booting a full agent
4. `brain sync` triggers sync and returns
5. `brain chat` launches the interactive REPL
6. `brain list posts --remote rover.rizom.ai` works against a deployed brain
7. `brain eval` runs evals with correct reporting
