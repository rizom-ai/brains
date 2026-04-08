# CLI Reference

The `brain` CLI scaffolds brain instances, boots them, runs diagnostics and evals, and can proxy commands to local or remote brains.

## Installation

```bash
bun add -g @rizom/brain
```

## Core commands

### `brain init <directory>`

Scaffold a new brain instance.

```bash
brain init mybrain
brain init mybrain --model relay
brain init mybrain --domain mybrain.example.com
brain init mybrain --content-repo github:user/brain-data
brain init mybrain --deploy
brain init mybrain --ai-api-key sk-...
brain init mybrain --no-interactive
```

**Options**

| Flag                    | Default            | Description                                           |
| ----------------------- | ------------------ | ----------------------------------------------------- |
| `--model <name>`        | `rover`            | Brain model: `rover`, `relay`, `ranger`               |
| `--domain <domain>`     | `{model}.rizom.ai` | Production domain                                     |
| `--content-repo <repo>` | —                  | Git repo for content sync                             |
| `--deploy`              | `false`            | Include `deploy.yml`, Kamal hook, and GitHub workflow |
| `--ai-api-key <key>`    | —                  | Pre-fill `.env` with `AI_API_KEY=<key>`               |
| `--no-interactive`      | `false`            | Skip interactive prompts and use only supplied flags  |

**Generated files**

| File                           | Always                               | With `--deploy`                      |
| ------------------------------ | ------------------------------------ | ------------------------------------ |
| `brain.yaml`                   | Yes                                  | Yes                                  |
| `package.json`                 | Yes                                  | Yes                                  |
| `README.md`                    | Yes                                  | Yes                                  |
| `.env.example`                 | Yes                                  | Yes                                  |
| `.gitignore`                   | Yes                                  | Yes                                  |
| `tsconfig.json`                | Yes                                  | Yes                                  |
| `.env`                         | Only when `--ai-api-key` is provided | Only when `--ai-api-key` is provided |
| `deploy.yml`                   | —                                    | Yes                                  |
| `.kamal/hooks/pre-deploy`      | —                                    | Yes                                  |
| `.github/workflows/deploy.yml` | —                                    | Yes                                  |

### `brain start`

Start the brain from the current directory.

```bash
cd mybrain
brain start
```

This boots the configured interfaces and services for the local instance.

### `brain chat`

Start the brain and open the local chat REPL.

```bash
brain chat
```

### `brain eval [args...]`

Run AI evaluations. Arguments are passed through to the eval runner.

```bash
brain eval
brain eval --compare
brain eval --baseline
```

### `brain diagnostics <subcommand>`

Run diagnostics helpers exposed by the runtime.

```bash
brain diagnostics search
```

Currently documented subcommands:

- `search` — inspect search distance distribution for threshold tuning

### `brain pin`

Create a local `package.json` that pins `@rizom/brain` to the current version and then run `bun install`.

Use this when you started with a global install and want a locally pinned runtime.

```bash
brain pin
```

### `brain tool <toolName> [inputJson]`

Invoke a tool directly.

```bash
brain tool system_status
brain tool system_search '{"query":"recent posts"}'
```

### `brain help`

Show help. When run from a directory with `brain.yaml`, the CLI also attempts to discover brain-specific commands.

### `brain version`

Show the installed CLI version.

## Brain-specific commands

Any command that is not one of the built-ins above is treated as a brain-specific command.

Examples:

```bash
brain sync
brain status
```

These are resolved from the running brain's tool registry. Available commands depend on the selected brain model, preset, and enabled plugins.

## Remote mode

Use `--remote` to run brain-specific commands against a deployed brain over MCP HTTP instead of booting a local instance.

```bash
brain --remote https://mybrain.example.com status
brain --remote https://mybrain.example.com search "topics"
brain --remote https://mybrain.example.com --token $TOKEN sync
```

| Flag              | Description                    |
| ----------------- | ------------------------------ |
| `--remote <url>`  | Remote brain base URL          |
| `--token <token>` | Auth token for remote MCP HTTP |

## Global options

| Flag              | Description  |
| ----------------- | ------------ |
| `--help`, `-h`    | Show help    |
| `--version`, `-v` | Show version |
