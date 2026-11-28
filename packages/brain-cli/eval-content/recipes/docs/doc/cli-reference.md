---
title: "CLI Reference"
section: "Run a brain"
order: 120
slug: "cli-reference"
description: "Commands such as brain init, brain start, brain chat and brain tool"
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
brain init mybrain --recipe team
brain init mybrain --domain mybrain.example.com
brain init mybrain --content-repo github:user/brain-data
brain init mybrain --backend none         # default: env vars only, no secret store
brain init mybrain --deploy
brain init mybrain --openai-api-key sk-...
brain init mybrain --no-interactive
```

**Options**

| Flag                        | Default                | Description                                                                                                                                                                                                                                                                                              |
| --------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--recipe <name>`           | `personal`             | Scaffold recipe: `headless`, `personal`, `professional`, or `team`                                                                                                                                                                                                                                       |
| `--domain <domain>`         | `{directory}.rizom.ai` | Production domain                                                                                                                                                                                                                                                                                        |
| `--content-repo <repo>`     | —                      | Git repo for content sync                                                                                                                                                                                                                                                                                |
| `--backend <name>`          | `none`                 | Secret backend. `none` (default) emits no `@plugin` directive — varlock load resolves every value from `process.env` (in CI, usually GitHub Actions secrets). Bitwarden-backed apps are migrated with `brain secrets:push --push-to bitwarden`, which rewrites `.env.schema` with pinned Bitwarden refs. |
| `--deploy`                  | `false`                | Include `config/deploy.yml`, the Kamal hook, the config extraction script, `deploy/Dockerfile`, the deploy scripts, and the publish/deploy GitHub workflows                                                                                                                                              |
| `--regen`                   | `false`                | Only with `--deploy`: rewrite every generated deployment file of an existing instance from the current templates and `.env.schema`, including `config/deploy.yml`. `brain.yaml`, `.env.schema`, and other existing files are kept.                                                                       |
| `--openai-api-key <key>`    | —                      | Pre-fill `.env` with `OPENAI_API_KEY=<key>`                                                                                                                                                                                                                                                              |
| `--anthropic-api-key <key>` | —                      | Pre-fill `.env` with `ANTHROPIC_API_KEY=<key>`                                                                                                                                                                                                                                                           |
| `--google-api-key <key>`    | —                      | Pre-fill `.env` with `GOOGLE_GENERATIVE_AI_API_KEY=<key>`                                                                                                                                                                                                                                                |
| `--model <model>`           | `gpt-6-luna`           | Chat model written to `brain.yaml`; key flags must cover it and the embedding model                                                                                                                                                                                                                      |
| `--image-model <model>`     | `gpt-image-1.5`        | Image model written to `brain.yaml`                                                                                                                                                                                                                                                                      |
| `--no-interactive`          | `false`                | Skip interactive prompts and use only supplied flags                                                                                                                                                                                                                                                     |

**Generated files**

| File                                  | Always                                | With `--deploy`                       |
| ------------------------------------- | ------------------------------------- | ------------------------------------- |
| `brain.yaml`                          | Yes                                   | Yes                                   |
| `package.json`                        | Yes                                   | Yes                                   |
| `README.md`                           | Yes                                   | Yes                                   |
| `.env.example`                        | Yes                                   | Yes                                   |
| `.env.schema`                         | Yes                                   | Yes                                   |
| `.gitignore`                          | Yes                                   | Yes                                   |
| `tsconfig.json`                       | Yes                                   | Yes                                   |
| `seed-content/`                       | Yes                                   | Yes                                   |
| `src/site.tsx`, `src/theme.css`       | Site recipes (`professional`, `team`) | Site recipes (`professional`, `team`) |
| `.env`                                | Only when a key is provided           | Only when a key is provided           |
| `config/deploy.yml`                   | —                                     | Yes                                   |
| `.kamal/hooks/pre-deploy`             | —                                     | Yes                                   |
| `scripts/extract-brain-config.rb`     | —                                     | Yes                                   |
| `deploy/Dockerfile`                   | —                                     | Yes                                   |
| `deploy/scripts/*.ts`                 | —                                     | Yes                                   |
| `.github/workflows/publish-image.yml` | —                                     | Yes                                   |
| `.github/workflows/deploy.yml`        | —                                     | Yes                                   |

The `deploy/scripts/` helpers are the ones the deploy workflow runs: `create-predeploy-backup.ts`, `install-health-watchdog.ts`, `provision-server.ts`, `pull-local-models.ts`, `reload-homeserver.ts`, `update-dns.ts`, `write-ssh-key.ts`, and the shared `helpers.ts`.

Running `brain init` on an existing directory creates only missing files, and refreshes generated deployment files it recognizes as stale; an existing `brain.yaml` keeps its selection and domain.

### `brain cert:bootstrap`

Issue a Cloudflare Origin CA certificate for the `domain:` declared in `brain.yaml`.

```bash
cd mybrain
brain cert:bootstrap
brain cert:bootstrap --push-to gh
```

The command writes `origin.pem` and `origin.key` into the current directory, then switches the Cloudflare zone to Full (strict). Use `--push-to gh` to push the cert and key into GitHub Actions secrets via the `gh` CLI; without `--push-to`, the files stay local and you handle storage yourself.

### `brain secrets:push`

Sync the local secrets from the current instance into GitHub Actions secrets or Bitwarden Secrets Manager. Reads the local schema plus values from `.env`, `.env.local`, and `process.env`, and skips any backend-bootstrap section keys.

```bash
cd mybrain
brain secrets:push --push-to gh
brain secrets:push --push-to gh --all
brain secrets:push --push-to gh --only OPENAI_API_KEY,HCLOUD_TOKEN
brain secrets:push --push-to gh --dry-run

# Bitwarden Secrets Manager
brain secrets:push --push-to bitwarden
brain secrets:push --push-to bitwarden --dry-run
```

Use `--all` to include extra keys from the local `.env` / `.env.local` files, `--only` to push a specific allowlist, and `--dry-run` to preview the push without writing anything. Dry runs split skipped keys into "Required before first deploy" and "Safe to ignore for now" so you can see which secrets still block an initial deploy.

For `--push-to bitwarden`, install/login requirements are:

- official `bws` CLI available on `PATH`
- `BWS_ACCESS_TOKEN` exported for a Bitwarden Secrets Manager machine account with read/write access

The Bitwarden project name is inferred from the current instance directory name. Missing projects are created automatically. Secret values are written through the Bitwarden SDK instead of CLI arguments, and `.env.schema` is updated with `bitwarden("<uuid>")` references plus the Varlock Bitwarden plugin wiring.

For multiline secrets such as `KAMAL_SSH_PRIVATE_KEY`, prefer file-backed values instead of shell heredocs:

```bash
KAMAL_SSH_PRIVATE_KEY_FILE=~/.ssh/id_ed25519
brain secrets:push --push-to gh
brain secrets:push --push-to bitwarden
```

`brain secrets:push` resolves `<SECRET>_FILE` by reading the file contents and pushing those exact bytes as `<SECRET>`. `.env.local` takes precedence over `.env`, and `~/...` paths resolve against the operator home directory. That is the preferred reproducible path for multiline keys. GitHub pushes continue to leave TLS cert PEMs to `brain cert:bootstrap`; Bitwarden pushes include PEMs when they are present in `.env.schema` because Bitwarden becomes the source-of-truth backend.

Generated deploy workflows resolve `.env.schema` with Varlock, retry compact resolution, mask resolved non-bootstrap values before exporting them to `$GITHUB_ENV`, and use multiline-safe `$GITHUB_ENV` entries. In Bitwarden mode, GitHub Actions should keep only the `BWS_ACCESS_TOKEN` bootstrap secret.

### `brain auth reset-passkeys`

Break-glass recovery for lost or compromised auth passkeys. This is a local-only destructive command that atomically clears passkey credentials and claims, WebAuthn challenges, auth sessions, authorization codes, refresh tokens, and active global setup links from `auth.db`. It preserves users, non-passkey identities, OAuth clients, and signing keys. Legacy JSON/JWK backup files are never read or modified.

```bash
cd mybrain
# Stop the running brain first.
brain auth reset-passkeys --yes
brain auth reset-passkeys --yes --storage-dir ./data/auth
```

After running it, restart the brain. On boot, the auth service detects that no passkeys remain and logs a fresh one-shot `/setup` URL. Auth storage must stay outside `brain-data`; the command refuses to modify paths under `brain-data`.

### `brain auth reinitialize-access`

Break-glass recovery for exact interface access. It replaces DB-backed Admin/trusted grants and Anchor bindings from the current `brain.yaml`, revokes active browser sessions and refresh tokens, and records the recovery in auth audit history. It preserves users, people, identities, passkeys, OAuth clients, signing keys, and external-peer links.

```bash
cd mybrain
# Stop the running brain first.
brain auth reinitialize-access --yes
brain auth reinitialize-access --yes --storage-dir ./data/auth
# Restart to load the new DB projection.
```

Ordinary startup seeds exact `admins`, `trusted`, and `anchors` entries only on first initialization and never reapplies changed configuration. Use this explicit command when access recovery must deliberately make the current configuration authoritative again. Pattern rules and shared-space selectors remain contextual configuration policy; the command handles exact principal entries only. Auth storage must stay outside `brain-data`.

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
brain start --startup-check    # smoke-test plugin lifecycle and exit
```

This boots the configured interfaces and services for the local instance. To boot with the chat REPL attached, use [`brain chat`](#brain-chat).

**Options**

| Flag              | Description                                                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--startup-check` | Load configured plugins, run `onRegister` and `onReady`, then exit. Does not start daemons or job workers and does not require provider keys. Intended for external plugin CI smoke tests. |

### `brain chat`

Start the brain and open the local chat REPL.

```bash
brain chat
```

`brain chat` also honors `--startup-check`, with the same behavior as `brain start` (load plugins, run `onRegister`/`onReady`, then exit without starting daemons or job workers).

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

### `brain config migrate`

Preview the deterministic migration from a legacy built-in model/preset configuration to
the canonical explicit-bundle format.

```bash
cd mybrain
brain config migrate
brain config migrate --recipe professional
```

The command reads `brain.yaml`, prints the proposed canonical YAML, and never writes the
file. It preserves instance-owned site/theme choices, seed paths, capability additions
and removals, plugin config, permission overrides, secret references, and comments where
the YAML syntax permits. A `brain.yaml` that already lists canonical bundle IDs but has no
`bundleContract` is ambiguous: pass `--recipe <name>` (`headless`, `personal`,
`professional`, or `team`) to name the reviewed target. Review the output, then apply it
deliberately with the matching runtime version.

### `brain assets:migrate`, `brain assets:verify`, `brain assets:reconcile`

Offline maintenance for images and PDFs. Stop the brain first: each command opens the
local entity database (default `<data dir>/brain.db`, or `--database <path>`) and refuses
to run while a live process holds it. `--ignore-stale-heartbeat` continues past a lease a
crash left behind; a fresh lease still refuses.

```bash
cd mybrain
brain assets:migrate --dry-run
brain assets:migrate
brain assets:verify --brain-data ./brain-data
brain assets:reconcile --dry-run
```

- `assets:migrate` moves images and PDFs stored inline in the database into durable
  assets. `--dry-run` decodes every inline row and reports without writing, and fails
  while any row would be blocked; a real run refuses to start while any is. Each run is
  appended to a manifest (default `binary-asset-migration.json` beside the database, or
  `--manifest <path>`).
- `assets:verify` checks a migrated database: every image and document reference
  resolves to one intact asset and no inline rows remain. With `--brain-data <dir>` it
  also compares each mirrored file in the synced content directory with the stored bytes.
- `assets:reconcile` restores image and PDF rows and assets from the synced content
  directory (`--from <dir>`, default `brain-data`). `--dry-run` reports what it would
  restore. Mismatches and unrecoverable records are reported for an operator.

### `brain pin`

Create a local `package.json` that pins `@rizom/brain` to the current version and then run `bun install`.

Use this when you started with a global install and want a locally pinned runtime.

```bash
brain pin
```

### `brain tool <toolName> [inputJson]`

Invoke a tool by its exact name, with JSON input, in a local brain booted for the call.

```bash
brain tool system_status
brain tool system_search '{"query":"recent posts"}'
brain tool system_delete '{"entityType":"note","id":"old-note"}' --yes
brain tool system_search '{"query":"recent posts"}' --permission public
```

| Flag                   | Description                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `--yes`                | Approve a confirmation the tool asks for in the same process; without it the command stops |
| `--permission <level>` | Run the call as `public`, `trusted`, or `admin` (default: Admin, like other CLI commands)  |

Both flags work only with the bundled runtime; a project with its own runner refuses them.

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

These are resolved from the running brain's tool registry. Available commands depend on selected bundles, additions/removals, and enabled plugins.

## Remote mode

Use `--remote` to run brain-specific commands against a deployed brain over MCP HTTP instead of booting a local instance.

```bash
brain --remote https://mybrain.example.com status
brain --remote https://mybrain.example.com search "topics"
brain --remote https://mybrain.example.com --token $TOKEN sync
```

| Flag              | Description                                                                         |
| ----------------- | ----------------------------------------------------------------------------------- |
| `--remote <url>`  | Remote brain: a bare domain or URL; `/mcp` is appended when missing                 |
| `--token <token>` | Auth token for remote MCP HTTP; falls back to the `BRAIN_REMOTE_TOKEN` env variable |

Remote mode applies only to brain-specific commands. Built-in commands such as `brain init`, `brain start`, and `brain tool` run in the local process and refuse `--remote` rather than boot a second brain against the same data.

## Global options

| Flag              | Description                                                                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--help`, `-h`    | Show help                                                                                                                                             |
| `--version`, `-v` | Show version                                                                                                                                          |
| `--remote <url>`  | Run a brain-specific command against a deployed brain (see above)                                                                                     |
| `--token <token>` | Auth token for `--remote`                                                                                                                             |
| `--preview`       | For a brain-specific command with an environment, use the preview one: `brain build --preview` builds the preview site, as `brain build preview` does |
