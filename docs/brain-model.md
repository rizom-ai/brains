# Brain Model & Instance Architecture

## Overview

Brains follow a **model/instance** separation:

- **Brain model** (`brains/`) — a reusable workspace package that defines what a brain _is_: its capabilities, interfaces, identity, permissions, and content model.
- **Brain instance** (`apps/<name>/`) — a lightweight instance package centered on `brain.yaml`, with per-instance support files like `.env`, `.env.example`, `.gitignore`, `tsconfig.json`, `package.json`, and optional deploy artifacts.

The same brain model can power multiple instances (dev, staging, prod) with different `brain.yaml` + `.env` files.

**Apps are not workspace members.** As of 2026-04, `apps/*` was removed from `package.json` workspaces. Each instance directory is still a small package-like boundary for local execution and deploy scaffolding, but it is consumed at runtime by the `brain` CLI from `@rizom/brain`, which reads `brain.yaml` from the cwd, dynamically imports the brain model package it references, and boots.

## Directory Structure

```
brains/
  rover/                    # Brain model package (@brains/rover)
    src/index.ts            # Brain definition (defineBrain)
    seed-content/           # Default content
    package.json            # Workspace member

apps/
  yeehaa.io/                # Brain instance (lightweight package, NOT a workspace member)
    brain.yaml              # Instance configuration
    .env                    # Secrets only
    .env.example            # Template for collaborators
    .gitignore
    tsconfig.json           # JSX runtime hint for Bun
    package.json            # Local execution boundary + dependency pinning
    config/deploy.yml       # (optional, only with `brain init <dir> --deploy`)
```

## brain.yaml

The instance configuration file. Declarative, no code, committable to git.

```yaml
# Required — which brain model to use
brain: relay

# Instance overrides (all optional)
name: relay-staging
logLevel: debug # debug | info | warn | error
port: 9090 # production server port
domain: staging.recall.ai # production domain
database: file:./data/brain.db # database URL

# Site package override (optional — overrides brain model default)
# Object form supports variant + theme overrides for sites that ship multiple flavors
site:
  package: "@brains/site-rizom"
  variant: ai
  # theme: "@brains/theme-rizom"  # optional

# Preset — selects a curated subset of capabilities + interfaces
preset: full # core | default | full | eval

# Fine-tune: add/remove individual plugins on top of the preset
add: [decks]
remove: [analytics]

# Per-plugin config overrides (keyed by plugin ID)
plugins:
  webserver:
    productionPort: 9090
  mcp:
    port: 3334
```

### Fields

| Field      | Type     | Description                                                                                          |
| ---------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `brain`    | string   | **Required.** Package name of the brain model                                                        |
| `site`     | object   | Site override: `{ package?, variant?, theme? }`. Omit to use the brain model's default site package. |
| `preset`   | string   | Preset name from brain model (`core`, `default`, `full`)                                             |
| `add`      | string[] | Plugin IDs to add on top of the preset                                                               |
| `remove`   | string[] | Plugin IDs to remove from the preset                                                                 |
| `name`     | string   | Override the instance name (default: from brain model)                                               |
| `logLevel` | enum     | `debug`, `info`, `warn`, `error`                                                                     |
| `port`     | number   | Production server port (sets `deployment.ports.production`)                                          |
| `domain`   | string   | Production domain (sets `deployment.domain`)                                                         |
| `database` | string   | Database URL                                                                                         |
| `anchors`  | string[] | Anchor users (full admin access)                                                                     |
| `trusted`  | string[] | Trusted users (elevated access)                                                                      |
| `plugins`  | object   | Per-plugin config overrides (see below)                                                              |

### Plugin Overrides

The `plugins:` section lets you override config for specific plugins without changing the brain model. Keys are plugin IDs (the first argument to `super()` in the plugin constructor):

```yaml
plugins:
  webserver:
    productionPort: 9090
  git-sync:
    autoSync: false
```

The override is shallow-merged with the plugin's resolved config. The plugin is instantiated once to read its ID, then re-instantiated with the merged config if overrides exist.

Common plugin IDs: `system`, `topics`, `summary`, `link`, `decks`, `directory-sync`, `git-sync`, `site-content`, `site-builder`, `mcp`, `discord`, `webserver`, `a2a`, `blog`, `newsletter`, `analytics`, `social-media`, `wishlist`.

## .env — Secrets Only

The `.env` file should contain **only values you'd rotate or revoke**:

```bash
AI_API_KEY=your-api-key-here
# AI_IMAGE_KEY=your-image-key-here  # optional, defaults to AI_API_KEY
GIT_SYNC_TOKEN=ghp_...
MCP_AUTH_TOKEN=...
CF_API_TOKEN=...
CF_ZONE_ID=...
```

Everything else belongs in `brain.yaml`. Non-secret config like homeserver URLs, user IDs, repos, domains — all go in `brain.yaml` under `plugins:`.

### What counts as a secret?

Ask: "Would I rotate or revoke this value if it leaked?" If yes → `.env`. If no → `brain.yaml`.

| Secret (`.env`)     | Config (`brain.yaml`)                |
| ------------------- | ------------------------------------ |
| `AI_API_KEY`        | `domain: recall.rizom.ai`            |
| `GIT_SYNC_TOKEN`    | `plugins.directory-sync.git.repo`    |
| `MCP_AUTH_TOKEN`    | `plugins.webserver.productionDomain` |
| `DISCORD_BOT_TOKEN` | `plugins.discord.guildId`            |
| `CF_API_TOKEN`      | `brain cert:bootstrap`               |
| `CF_ZONE_ID`        | `brain cert:bootstrap`               |

## Brain Model Definition

Brain models use `defineBrain()` from `@brains/app`:

```typescript
import { defineBrain, type BrainEnvironment } from "@brains/app";
import { systemPlugin } from "@brains/system";
import { MCPInterface } from "@brains/mcp";
import { WebserverInterface } from "@brains/webserver";

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
    // [id, factory, config] tuples
    // Use env mappers ONLY for actual secrets
    ["system", systemPlugin, {}],
    [
      "git-sync",
      gitSyncPlugin,
      (env: BrainEnvironment) => ({
        authToken: env["GIT_SYNC_TOKEN"],
        autoSync: true,
      }),
    ],
  ],

  interfaces: [
    // [id, constructor, envMapper] tuples
    ["mcp", MCPInterface, (env) => ({ authToken: env["MCP_AUTH_TOKEN"] })],
    ["webserver", WebserverInterface, () => ({})],
  ],

  permissions: {
    anchors: ["discord:123456789"],
    rules: [
      { pattern: "cli:*", level: "anchor" },
      { pattern: "mcp:stdio", level: "anchor" },
    ],
  },

  deployment: {
    domain: "my-brain.example.com",
    cdn: { enabled: true, provider: "bunny" },
  },
});
```

### Capabilities vs Interfaces

- **Capabilities** are `[id, factory, config]` tuples — the id is used for preset/override matching, the factory is called with the config to create a plugin instance.
- **Interfaces** are `[id, constructor, envMapper]` tuples — the id is used for preset/override matching, the constructor is called with `new` and the env mapper provides config. Return `null` from the env mapper to skip the interface (e.g. when credentials are missing).
- Both support env-mapped configs: `(env: BrainEnvironment) => config` for values that come from the deployment environment.

### Env Mappers — Secrets Only

Env mapper functions receive a `BrainEnvironment` (a `Record<string, string | undefined>`) which contains `.env` secrets and system environment variables. **Use env mappers only for actual secrets.** Non-secret config should be static defaults in the brain model, overridable via `brain.yaml`:

```typescript
// ✅ Good: env mapper only wires the secret
["git-sync", gitSyncPlugin, (env: BrainEnvironment) => ({
  authToken: env["GIT_SYNC_TOKEN"],  // secret from .env
  autoSync: true,
})],

// ❌ Bad: using env for non-secret config
["git-sync", gitSyncPlugin, (env: BrainEnvironment) => ({
  repo: env["GIT_SYNC_REPO"] || "default/repo",  // not a secret!
  authToken: env["GIT_SYNC_TOKEN"],
})],
```

To override non-secret defaults per instance, use `brain.yaml`:

```yaml
plugins:
  git-sync:
    repo: "other-org/other-repo"
```

## Running

The `brain` CLI ships from `@rizom/brain`. Install it once globally, then run any instance directory:

```bash
# Install once
bun add -g @rizom/brain

# From any instance directory with a brain.yaml
cd ~/Documents/yeehaa-io
brain start            # start the brain
brain start --cli      # start with the CLI chat interface attached
brain init mybrain     # scaffold a new instance directory (interactive prompts)
brain init mybrain --deploy   # scaffold + config/deploy.yml + CI workflow
brain diagnostics search      # search threshold tuning
brain diagnostics usage       # aggregate ai:usage events from the log file
brain --help
```

Instance directories can live outside the monorepo. The `brain` CLI is the primary entrypoint.

## Resolution Flow

When `brains` starts:

1. **Read** `brain.yaml` → parse instance overrides
2. **Import** the brain package (dynamic `import()`)
3. **Resolve** `(definition, env, overrides)` → `AppConfig`:
   - Resolve preset → compute active plugin IDs (preset + add - remove)
   - Resolve site package (brain.yaml `site:` overrides brain model default)
   - Instantiate only active capabilities and interfaces from definition tuples
   - Apply `plugins:` config overrides (merged with base config)
   - Apply top-level overrides (`name`, `logLevel`, `database`, `domain`, `port`)
   - Extract AI keys from env
4. **Run** via `handleCLI(config)`

## Creating a New Brain

### Reusing an existing brain model (the common case)

Use `brain init` from the published CLI:

```bash
bun add -g @rizom/brain
brain init mybrain          # interactive prompts (model, domain, content repo, API key)
cd mybrain
brain start
```

`brain init` is interactive (via `@clack/prompts`) and writes:

- `brain.yaml` — defaults to `brain: rover` + `preset: core` (the minimal viable brain), with a commented-out `directory-sync` block as an on-ramp
- `.env.example` — template listing required and optional env vars
- `.env` — only when an API key was supplied (interactive prompt or `--api-key`)
- `.gitignore`, `tsconfig.json` (JSX runtime hint for Bun)
- `package.json` — local execution boundary + dependency pinning for `@rizom/brain` and `preact`
- `config/deploy.yml`, `.kamal/hooks/pre-deploy`, `.github/workflows/deploy.yml` — only with `--deploy`

So the instance remains lightweight, but it is not a pure config blob.

### Defining a new brain model (uncommon)

Only needed when you want a different curated capability set than `rover` / `ranger` / `relay` ship with.

1. Create the model package:

   ```bash
   mkdir -p brains/my-brain/src
   ```

2. Define the brain in `brains/my-brain/src/index.ts` using `defineBrain()` (see example above).

3. Add `brains/my-brain/package.json`:

   ```json
   {
     "name": "@brains/my-brain",
     "version": "1.0.0",
     "type": "module",
     "main": "src/index.ts",
     "dependencies": {
       "@brains/app": "workspace:*"
     }
   }
   ```

4. Create an instance that pins the new model:

   ```bash
   mkdir apps/my-brain-prod
   cat > apps/my-brain-prod/brain.yaml <<EOF
   brain: my-brain
   domain: my-brain.example.com
   preset: core
   EOF
   ```

5. Add secrets in `apps/my-brain-prod/.env` and run `cd apps/my-brain-prod && brain start`.

## Dev vs Production Instances

The same brain model can power both dev and production via separate lightweight instance package directories:

```
~/Documents/yeehaa-io-dev/    # Dev instance
├── brain.yaml                # Dev config
│   brain: rover
│   logLevel: debug
│   plugins:
│     directory-sync:
│       git:
│         repo: my-org/brain-content
├── .env                      # Dev secrets
│   AI_API_KEY=...
│   GIT_SYNC_TOKEN=...

~/Documents/yeehaa-io/        # Production instance
├── brain.yaml                # Production config
│   brain: rover
│   domain: yeehaa.io
├── .env                      # Production secrets (gitignored)
│   AI_API_KEY=...
│   GIT_SYNC_TOKEN=...
├── config/deploy.yml         # Kamal deploy config (with `brain init <dir> --deploy`)
└── .kamal/hooks/             # Kamal lifecycle hooks
```

Both directories run via the same `brain start` command — the only difference is the `brain.yaml` they sit next to. No build step, no static entrypoint generation, no package bundling.
