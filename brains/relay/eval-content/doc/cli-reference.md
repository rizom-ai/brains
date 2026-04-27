---
title: "CLI Reference"
section: "Start here"
order: 30
sourcePath: "packages/brain-cli/docs/cli-reference.md"
slug: "cli-reference"
description: "The brain CLI scaffolds brain instances, boots them, runs diagnostics and evals, and can proxy commands to local or remote brains."
---

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
brain init mybrain --backend none         # default: env vars only, no secret store
brain init mybrain --deploy
brain init mybrain --ai-api-key sk-...
brain init mybrain --no-interactive
```

**Options**

| Flag                    | Default            | Description                                                                                                                                                                                                                                                                                               |
| ----------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--model <name>`        | `rover`            | Brain model: `rover`, `relay`, `ranger`                                                                                                                                                                                                                                                                   |
| `--domain <domain>`     | `{model}.rizom.ai` | Production domain                                                                                                                                                                                                                                                                                         |
| `--content-repo <repo>` | —                  | Git repo for content sync                                                                                                                                                                                                                                                                                 |
| `--backend <name>`      | `none`             | Secret backend. `none` (default) emits no `@plugin` directive — varlock load resolves every value from `process.env` (in CI, from GitHub Actions secrets). Pass any other name to emit a generic `@plugin(@varlock/<name>-plugin)` line you can hand-tune; no other backend is verified end-to-end today. |
| `--deploy`              | `false`            | Include `config/deploy.yml`, Kamal hook, `deploy/Dockerfile`, and publish/deploy GitHub workflows                                                                                                                                                                                                         |
| `--ai-api-key <key>`    | —                  | Pre-fill `.env` with `AI_API_KEY=<key>`                                                                                                                                                                                                                                                                   |
| `--no-interactive`      | `false`            | Skip interactive prompts and use only supplied flags                                                                                                                                                                                                                                                      |

**Generated files**

| File                                  | Always                               | With `--deploy`                      |
| ------------------------------------- | ------------------------------------ | ------------------------------------ |
| `brain.yaml`                          | Yes                                  | Yes                                  |
| `package.json`                        | Yes                                  | Yes                                  |
| `README.md`                           | Yes                                  | Yes                                  |
| `.env.example`                        | Yes                                  | Yes                                  |
| `.env.schema`                         | Yes                                  | Yes                                  |
| `.gitignore`                          | Yes                                  | Yes                                  |
| `tsconfig.json`                       | Yes                                  | Yes                                  |
| `.env`                                | Only when `--ai-api-key` is provided | Only when `--ai-api-key` is provided |
| `config/deploy.yml`                   | —                                    | Yes                                  |
| `.kamal/hooks/pre-deploy`             | —                                    | Yes                                  |
| `deploy/Dockerfile`                   | —                                    | Yes                                  |
| `.github/workflows/publish-image.yml` | —                                    | Yes                                  |
| `.github/workflows/deploy.yml`        | —                                    | Yes                                  |

### `brain cert:bootstrap`

Issue a Cloudflare Origin CA certificate for the `domain:` declared in `brain.yaml`.

```bash
cd mybrain
brain cert:bootstrap
brain cert:bootstrap --push-to gh
```

The command writes `origin.pem` and `origin.key` into the current directory, then switches the Cloudflare zone to Full (strict). Use `--push-to gh` to push the cert and key into GitHub Actions secrets via the `gh` CLI; without `--push-to`, the files stay local and you handle storage yourself.

### `brain secrets:push`

Sync the local secrets from the current instance into GitHub Actions secrets. Reads the local schema plus values from `.env`, `.env.local`, and `process.env`, skips any backend-bootstrap section keys, and leaves TLS cert artifacts to `brain cert:bootstrap`.

```bash
cd mybrain
brain secrets:push --push-to gh
brain secrets:push --push-to gh --all
brain secrets:push --push-to gh --only AI_API_KEY,HCLOUD_TOKEN
brain secrets:push --push-to gh --dry-run
```

`--push-to gh` is the only supported target today. Use `--all` to include extra keys from the local `.env` / `.env.local` files, `--only` to push a specific allowlist, and `--dry-run` to preview the push without writing anything. Dry runs split skipped keys into "Required before first deploy" and "Safe to ignore for now" so you can see which secrets still block an initial deploy.

For multiline secrets such as `KAMAL_SSH_PRIVATE_KEY`, prefer file-backed values instead of shell heredocs:

```bash
KAMAL_SSH_PRIVATE_KEY_FILE=~/.ssh/id_ed25519
brain secrets:push --push-to gh
```

`brain secrets:push` resolves `<SECRET>_FILE` by reading the file contents and pushing those exact bytes as `<SECRET>`. `.env.local` takes precedence over `.env`, and `~/...` paths resolve against the operator home directory. That is the preferred reproducible path for multiline keys.

### `brain ssh-key:bootstrap`

Create or reuse a deploy SSH key locally, ensure the matching public key exists in Hetzner, and optionally push the private key into GitHub Actions secrets.

```bash
cd mybrain
brain ssh-key:bootstrap
brain ssh-key:bootstrap --push-to gh
```

The command reads `HCLOUD_TOKEN`, `HCLOUD_SSH_KEY_NAME`, and optionally `KAMAL_SSH_PRIVATE_KEY_FILE` from `.env.local`, `.env`, or `process.env`.

Behavior:

- creates an ed25519 keypair when the configured private key file does not exist
- derives and validates the public key from the private key
- creates the Hetzner SSH key when `HCLOUD_SSH_KEY_NAME` is missing there
- refuses to continue if Hetzner already has that key name with different public key bytes
- with `--push-to gh`, pushes the private key contents to GitHub as `KAMAL_SSH_PRIVATE_KEY`

Recommended local contract:

```bash
HCLOUD_SSH_KEY_NAME=mybrain-deploy
KAMAL_SSH_PRIVATE_KEY_FILE=~/.ssh/mybrain_deploy_ed25519
```

After the first bootstrap, `brain secrets:push --push-to gh` remains the generic resync path.

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
- `usage` — aggregate `ai:usage` events from the configured log file

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
