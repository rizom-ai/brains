# brain.yaml Reference

`brain.yaml` is the instance-level configuration file for a brain. It selects the brain model, chooses a preset, overrides deployment settings, and passes config to plugins and interfaces.

Secrets should live in `.env` and be referenced with `${ENV_VAR}` interpolation.

## Example

```yaml
brain: rover
domain: mybrain.example.com
preset: core

anchors: []

site:
  package: "@brains/site-default"

plugins:
  # Uncomment to enable git-backed sync of brain content:
  # directory-sync:
  #   git:
  #     repo: your-org/brain-data
  #     authToken: ${GIT_SYNC_TOKEN}
  mcp:
    authToken: ${MCP_AUTH_TOKEN}
```

## Supported top-level fields

```yaml
brain: rover
site:
  package: "@brains/site-default"
  theme: "@brains/theme-default"
name: "My Brain"
logLevel: info
logFile: ./brain.log
port: 4321
domain: mybrain.example.com
database: file:./data/brain.db
model: gpt-4.1
preset: core
mode: eval
add:
  - stock-photo
remove:
  - discord
anchors:
  - "discord:123456789"
trusted:
  - "discord:987654321"
plugins:
  mcp:
    authToken: ${MCP_AUTH_TOKEN}
permissions:
  anchors:
    - "cli:*"
  trusted:
    - "discord:123456789"
  rules:
    - pattern: "a2a:*"
      level: public
```

## Fields

### `brain` (required)

The brain model to run.

Accepted forms:

- bare built-in name, such as `rover`, `relay`, or `ranger`
- scoped package name, such as `@my-org/my-brain`
- legacy `@brains/rover`-style refs are still accepted for compatibility

### `site`

Optional site override.

```yaml
site:
  package: "@brains/site-default"
  theme: "@brains/theme-default"
```

Fields:

- `package` — site package to load
- `variant` — optional site-specific flavor string for packages that support it
- `theme` — theme package or inline CSS string to use for styling

`site.package` and `site.theme` are resolved independently. The site package stays structural-only; the theme is validated separately and injected into site-builder.

Use this when the brain model's built-in site package is not the one you want, or when you want to pair the same site package with a different theme.

### `name`

Optional instance name override.

### `logLevel`

Logging verbosity.

Allowed values:

- `debug`
- `info`
- `warn`
- `error`

### `logFile`

Optional log file path.

When set, logs are also written to disk. This is useful for usage tracking and postmortem debugging.

### `port`

Optional production port override.

### `domain`

Production domain for the instance.

Used for:

- canonical site URLs
- preview URL derivation
- A2A endpoint discovery
- CMS and webserver identity

### `database`

Database URL, usually SQLite.

Example:

```yaml
database: file:./data/brain.db
```

### `model`

Override the default AI model.

Examples:

```yaml
model: gpt-4.1
model: claude-haiku-4-5
model: openai:gpt-4o-mini
```

The provider is inferred from the model name unless you prefix it explicitly.

### `preset`

Select a curated subset of capabilities and interfaces defined by the brain model.

Current built-in presets:

| Brain model | Presets                   |
| ----------- | ------------------------- |
| `rover`     | `core`, `default`, `full` |
| `relay`     | `core`, `default`         |
| `ranger`    | `default`                 |

If omitted, resolution falls back to the brain model's default preset behavior. In practice, it is best to set this explicitly.

### `mode`

Runtime mode override.

Currently supported:

- `eval` — disables side-effectful capabilities listed by the brain model's `evalDisable`

### `add` / `remove`

Refine the selected preset.

```yaml
preset: default
add:
  - stock-photo
remove:
  - discord
```

These entries refer to capability/interface ids from the brain model.

### `anchors`

Top-level shorthand for full-access identities.

```yaml
anchors:
  - "discord:000000000000000000"
```

### `trusted`

Top-level shorthand for elevated-access identities.

### `plugins`

Per-plugin config overrides keyed by plugin/interface id.

```yaml
plugins:
  directory-sync:
    git:
      repo: your-org/brain-data
      authToken: ${GIT_SYNC_TOKEN}
  mcp:
    authToken: ${MCP_AUTH_TOKEN}
  discord:
    botToken: ${DISCORD_BOT_TOKEN}
```

These values are merged into the selected capability or interface config.

### `permissions`

Explicit permission configuration.

```yaml
permissions:
  anchors:
    - "cli:*"
  trusted:
    - "discord:123456789"
  rules:
    - pattern: "a2a:friendbrain"
      level: trusted
    - pattern: "a2a:*"
      level: public
```

Fields:

- `anchors` — full-access identities
- `trusted` — elevated-access identities
- `rules` — pattern-based permission rules

Allowed rule levels:

- `anchor`
- `trusted`
- `public`

### Permission precedence

Permission config is merged in this order:

1. brain-model defaults
2. top-level `anchors` / `trusted`
3. nested `permissions` block

So the nested `permissions` block wins over the top-level shorthand.

## Environment variable interpolation

String values support `${ENV_VAR}` syntax.

```yaml
plugins:
  mcp:
    authToken: ${MCP_AUTH_TOKEN}
```

Notes:

- values are resolved from the environment at startup
- unset env vars are stripped out rather than left as literal strings
- empty YAML fields like `anchors:` are treated as absent values, not errors

## Common environment variables

| Variable            | Typical use                   |
| ------------------- | ----------------------------- |
| `AI_API_KEY`        | Main AI provider key          |
| `AI_IMAGE_KEY`      | Separate image-generation key |
| `GIT_SYNC_TOKEN`    | Git-backed content sync       |
| `MCP_AUTH_TOKEN`    | MCP HTTP auth                 |
| `DISCORD_BOT_TOKEN` | Discord bot interface         |

## Deploy/bootstrap environment variables

These are not usually interpolated directly inside `brain.yaml`, but they show up in the deploy and bootstrap docs for `brain init <dir> --deploy` + `brain cert:bootstrap`.

| Variable                  | Typical use                                  |
| ------------------------- | -------------------------------------------- |
| `KAMAL_REGISTRY_PASSWORD` | GHCR auth for Kamal                          |
| `SERVER_IP`               | Instance server IP in deploy workflows       |
| `CF_API_TOKEN`            | Cloudflare API token for Origin CA bootstrap |
| `CF_ZONE_ID`              | Cloudflare zone ID for Origin CA bootstrap   |
| `CERTIFICATE_PEM`         | Origin CA certificate secret                 |
| `PRIVATE_KEY_PEM`         | Origin CA private key secret                 |

## Examples

### Minimal rover instance

```yaml
brain: rover
preset: core

anchors: []

plugins:
  mcp:
    authToken: ${MCP_AUTH_TOKEN}
```

### Public rover instance with site + sync

```yaml
brain: rover
domain: mybrain.example.com
preset: full

site:
  package: "@brains/site-default"

anchors:
  - "discord:000000000000000000"

plugins:
  directory-sync:
    git:
      repo: your-org/brain-data
      authToken: ${GIT_SYNC_TOKEN}
  mcp:
    authToken: ${MCP_AUTH_TOKEN}
  discord:
    botToken: ${DISCORD_BOT_TOKEN}
```

### Relay instance with explicit permissions

```yaml
brain: relay
domain: team.example.com
preset: default

permissions:
  anchors:
    - "cli:*"
  rules:
    - pattern: "a2a:*"
      level: public

plugins:
  mcp:
    authToken: ${MCP_AUTH_TOKEN}
```

### Ranger instance using an explicit site wrapper

```yaml
brain: ranger
preset: default
domain: rizom.ai

site:
  package: "@brains/site-rizom-ai"
  theme: "@brains/theme-rizom"

plugins:
  mcp:
    authToken: ${MCP_AUTH_TOKEN}
```
