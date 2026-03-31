# CLI Reference

The `brain` CLI manages brain instances — scaffolding, starting, debugging, and remote access.

## Installation

```bash
bun install -g @rizom/brain
```

## Commands

### `brain init <directory>`

Scaffold a new brain instance.

```bash
brain init mybrain
brain init mybrain --model relay
brain init mybrain --model rover --domain mybrain.com --content-repo github:user/brain-data
brain init mybrain --deploy    # Include Kamal deployment files
```

**Options:**

| Flag                    | Default            | Description                                          |
| ----------------------- | ------------------ | ---------------------------------------------------- |
| `--model <name>`        | `rover`            | Brain model: `rover`, `relay`, `ranger`              |
| `--domain <domain>`     | `{model}.rizom.ai` | Production domain                                    |
| `--content-repo <repo>` | —                  | Git repo for content (e.g. `github:user/brain-data`) |
| `--deploy`              | `false`            | Include deploy.yml, Kamal hooks, CI workflow         |

**Generated files:**

| File                           | Always | With `--deploy` |
| ------------------------------ | ------ | --------------- |
| `brain.yaml`                   | Yes    | Yes             |
| `package.json`                 | Yes    | Yes             |
| `.env.example`                 | Yes    | Yes             |
| `.gitignore`                   | Yes    | Yes             |
| `deploy.yml`                   | —      | Yes             |
| `.kamal/hooks/pre-deploy`      | —      | Yes             |
| `.github/workflows/deploy.yml` | —      | Yes             |

### `brain start`

Start the brain with all configured daemons (webserver, MCP server, Discord bot, A2A endpoint). Runs from the directory containing `brain.yaml`.

```bash
cd mybrain
brain start
```

### `brain chat`

Start the brain with an interactive chat REPL in the terminal. Same as `brain start` but opens a conversational interface.

```bash
brain chat
```

### `brain eval [args...]`

Run AI evaluations. Pass-through to the brain evaluation framework.

```bash
brain eval
brain eval --compare                # Compare against baseline
brain eval --baseline               # Set current results as baseline
```

### `brain tool <name> [input]`

Invoke a specific tool directly. Useful for debugging.

```bash
brain tool system_search '{"query": "quantum computing"}'
brain tool system_status
brain tool directory-sync_sync
```

### `brain help`

Show help message. When run from a directory with `brain.yaml`, also lists brain-specific commands discovered from the running brain.

### `brain version`

Show CLI version.

### `brain <command> [args]`

Brain-specific commands. These are tools with CLI metadata, auto-discovered from the brain model. Run `brain help` from a directory with `brain.yaml` to see available commands.

```bash
brain sync              # Trigger content sync
brain status            # Show brain status
```

## Global Options

| Flag              | Description  |
| ----------------- | ------------ |
| `--help`, `-h`    | Show help    |
| `--version`, `-v` | Show version |

## Remote Mode

Query a deployed brain over MCP HTTP without running it locally.

```bash
brain --remote https://mybrain.example.com search '{"query": "recent posts"}'
brain --remote https://mybrain.example.com status
```

| Flag              | Description                                      |
| ----------------- | ------------------------------------------------ |
| `--remote <url>`  | Deployed brain URL                               |
| `--token <token>` | Auth token (or set `BRAIN_REMOTE_TOKEN` env var) |
