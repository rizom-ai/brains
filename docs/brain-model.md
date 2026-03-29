# Brain Model & Instance Architecture

## Overview

Brains follow a **model/instance** separation:

- **Brain model** (`brains/`) — a reusable package that defines what a brain _is_: its capabilities, interfaces, identity, permissions, and content model.
- **Brain instance** (`apps/`) — a deployment of a brain model with instance-specific configuration and secrets.

This means the same brain model can power multiple deployments (dev, staging, prod) with different settings.

## Directory Structure

```
brains/
  team/                     # Brain model package (@brains/relay)
    src/index.ts            # Brain definition (defineBrain)
    seed-content/           # Default content
    package.json

apps/
  team-brain/               # Brain instance (deployment)
    brain.yaml              # Instance configuration
    .env                    # Secrets only
    package.json            # Dependencies
```

## brain.yaml

The instance configuration file. Declarative, no code, committable to git.

```yaml
# Required — which brain model to use
brain: "@brains/relay"

# Instance overrides (all optional)
name: team-brain-staging
logLevel: debug # debug | info | warn | error
port: 9090 # production server port
domain: staging.recall.ai # production domain
database: file:./data/brain.db # database URL

# Site package override (optional — overrides brain model default)
site: "@brains/site-yeehaa"

# Preset — selects a curated subset of capabilities + interfaces
preset: pro # minimal | default | pro | eval

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

| Field      | Type     | Description                                                 |
| ---------- | -------- | ----------------------------------------------------------- |
| `brain`    | string   | **Required.** Package name of the brain model               |
| `site`     | string   | Site package override (e.g. `@brains/site-yeehaa`)          |
| `preset`   | string   | Preset name from brain model (`minimal`, `default`, `pro`)  |
| `add`      | string[] | Plugin IDs to add on top of the preset                      |
| `remove`   | string[] | Plugin IDs to remove from the preset                        |
| `name`     | string   | Override the instance name (default: from brain model)      |
| `logLevel` | enum     | `debug`, `info`, `warn`, `error`                            |
| `port`     | number   | Production server port (sets `deployment.ports.production`) |
| `domain`   | string   | Production domain (sets `deployment.domain`)                |
| `database` | string   | Database URL                                                |
| `anchors`  | string[] | Anchor users (full admin access)                            |
| `trusted`  | string[] | Trusted users (elevated access)                             |
| `plugins`  | object   | Per-plugin config overrides (see below)                     |

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
ANTHROPIC_API_KEY=sk-ant-...
MATRIX_ACCESS_TOKEN=syt_...
GIT_SYNC_TOKEN=ghp_...
MCP_AUTH_TOKEN=...
CLOUDFLARE_API_TOKEN=...
```

Everything else belongs in `brain.yaml`. Non-secret config like homeserver URLs, user IDs, repos, domains — all go in `brain.yaml` under `plugins:`.

### What counts as a secret?

Ask: "Would I rotate or revoke this value if it leaked?" If yes → `.env`. If no → `brain.yaml`.

| Secret (`.env`)        | Config (`brain.yaml`)                |
| ---------------------- | ------------------------------------ |
| `ANTHROPIC_API_KEY`    | `domain: recall.rizom.ai`            |
| `GIT_SYNC_TOKEN`       | `plugins.directory-sync.git.repo`    |
| `MCP_AUTH_TOKEN`       | `plugins.webserver.productionDomain` |
| `DISCORD_BOT_TOKEN`    | `plugins.discord.guildId`            |
| `CLOUDFLARE_API_TOKEN` | `logLevel: debug`                    |

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

```bash
# From an app directory with brain.yaml
brains              # start the brain
brains --cli        # start with CLI interface
brains --help       # show help
brains --version    # show version

# Or via package.json scripts
bun run start       # runs: brains
bun run dev         # runs: bun --watch node_modules/.bin/brains
```

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

1. Create the model:

```bash
mkdir -p brains/my-brain/src
```

2. Define the brain in `brains/my-brain/src/index.ts` using `defineBrain()`

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

4. Create the instance:

```bash
mkdir apps/my-brain-prod
```

5. Add `apps/my-brain-prod/brain.yaml`:

```yaml
brain: "@brains/my-brain"
domain: my-brain.example.com
```

6. Add `apps/my-brain-prod/package.json`:

```json
{
  "name": "@brains/my-brain-prod",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "start": "brains",
    "dev": "bun --watch node_modules/.bin/brains"
  },
  "dependencies": {
    "@brains/app": "workspace:*",
    "@brains/my-brain": "workspace:*"
  }
}
```

7. Add secrets in `apps/my-brain-prod/.env`

8. Run: `cd apps/my-brain-prod && bun run start`

## Dev vs Production Instances

The same brain model can power both dev and production with different `brain.yaml` + `.env` files:

```
apps/team-brain/              # Dev instance
├── brain.yaml                # Dev config
│   brain: "@brains/relay"
│   logLevel: debug
│   plugins:
│     directory-sync:
│       git:
│         repo: my-org/team-brain-content
├── .env                      # Dev secrets
│   ANTHROPIC_API_KEY=...
│   GIT_SYNC_TOKEN=...

apps/team-brain/deploy/       # Production deploy artifacts
├── brain.yaml                # Production config
│   brain: "@brains/relay"
│   domain: recall.rizom.ai
│   plugins:
│     webserver:
│       productionDomain: https://recall.rizom.ai
├── .env.production           # Production secrets
│   ANTHROPIC_API_KEY=...
│   GIT_SYNC_TOKEN=...
```

The build script (`brain-build`) generates a static entrypoint from `brain.yaml`, bundles with the brain package, and copies `brain.yaml` to `dist/`.
