# brain.yaml Reference

`brain.yaml` is the instance-level configuration file for a brain. It controls which brain model to use, what plugins to enable, how permissions work, and where to deploy. Secrets stay in `.env`; everything else goes here.

## Full Schema

```yaml
# Required — which brain model to run
brain: rover # or relay, ranger

# Site package — overrides the brain model's default theme, layout, and routes
site: "@brains/site-yeehaa"

# Instance name (overrides the brain model default)
name: "My Brain"

# Logging verbosity
logLevel: debug # debug | info | warn | error

# Production server port
port: 4321

# Production domain (used for canonical URLs, A2A endpoint, CMS)
domain: mybrain.example.com

# Database connection string
database: "file:./data/brain.db"

# Preset — curated subset of plugins and interfaces
preset: default # minimal | default | pro

# Evaluation mode — disables plugins with side effects
mode: eval

# Add/remove plugins on top of the preset
add:
  - stock-photo
  - newsletter
remove:
  - discord

# Anchor users — full admin access
anchors:
  - "discord:123456789"

# Trusted users — elevated access
trusted:
  - "discord:987654321"

# Per-plugin configuration
plugins:
  directory-sync:
    git:
      repo: your-org/brain-data
      authToken: ${GIT_SYNC_TOKEN}
  mcp:
    authToken: ${MCP_AUTH_TOKEN}
  discord:
    botToken: ${DISCORD_BOT_TOKEN}

# Permission rules
permissions:
  rules:
    - pattern: "a2a:*"
      level: public
    - pattern: "cli:*"
      level: anchor
```

## Fields

### `brain` (required)

The brain model package to run. Determines which entity types, plugins, and interfaces are available.

| Value    | Description                                           |
| -------- | ----------------------------------------------------- |
| `rover`  | Personal brain — blog, portfolio, decks, notes, links |
| `relay`  | Team brain — shared knowledge, summaries, decks       |
| `ranger` | Collective brain — curated content, community         |

### `site`

Overrides the brain model's default site package. A site package bundles theme CSS, layout components, routes, and site content.

```yaml
site: "@brains/site-yeehaa"
```

### `name`

Override the instance name. Defaults to the brain model's name.

### `logLevel`

Controls logging verbosity. One of: `debug`, `info`, `warn`, `error`.

### `port`

Server port for the webserver. Default: `4321`.

### `domain`

Production domain. Used to derive:

- Canonical URLs for the static site
- A2A endpoint (`https://domain/.well-known/agent.json`)
- CMS base URL
- Preview URL (`preview.domain`)

```yaml
domain: mybrain.example.com
```

### `database`

SQLite database connection string. Default: `file:./data/brain.db`.

### `preset`

Selects a curated subset of plugins and interfaces. Each brain model defines its own presets.

**Rover presets:**

| Preset    | Includes                                                                                                       |
| --------- | -------------------------------------------------------------------------------------------------------------- |
| `minimal` | prompt, note, link, wishlist, directory-sync, mcp, discord, a2a                                                |
| `default` | minimal + image, dashboard, blog, series, decks, analytics, obsidian-vault, site-info, site-builder, webserver |
| `pro`     | default + portfolio, topics, content-pipeline, social-media, newsletter, buttondown, stock-photo               |

### `mode`

Set to `eval` to run in evaluation mode. This disables plugins that have side effects (defined by the brain model's `evalDisable` list) so evaluations don't send emails, post to social media, etc.

### `add` / `remove`

Fine-tune the preset by adding or removing specific plugin/interface IDs.

```yaml
preset: default
add:
  - stock-photo # Add stock photo search
remove:
  - discord # Don't start Discord bot
```

### `anchors`

List of user identifiers with full admin access. Format: `"interface:id"`.

```yaml
anchors:
  - "discord:1442828818493735015"
```

### `trusted`

List of user identifiers with elevated (but not admin) access.

### `plugins`

Per-plugin configuration overrides. Keyed by plugin ID, values are arbitrary nested objects passed to the plugin.

```yaml
plugins:
  directory-sync:
    git:
      repo: your-org/brain-data
      authToken: ${GIT_SYNC_TOKEN}
      authorName: Brain
      authorEmail: brain@example.com
  analytics:
    cloudflare:
      accountId: ${CLOUDFLARE_ACCOUNT_ID}
      apiToken: ${CLOUDFLARE_API_TOKEN}
      siteTag: ${CLOUDFLARE_ANALYTICS_SITE_TAG}
  a2a:
    trustedTokens:
      ${A2A_TOKEN_FRIEND}: friendbrain
    outboundTokens:
      friendbrain.com: ${A2A_OUTBOUND_TOKEN}
```

### `permissions`

Pattern-based permission rules. Patterns match `"interface:userId"` strings.

```yaml
permissions:
  rules:
    - pattern: "a2a:friendbrain"
      level: trusted
    - pattern: "a2a:*"
      level: public
    - pattern: "cli:*"
      level: anchor
```

Levels: `anchor` (full access), `trusted` (elevated), `public` (read-only).

## Environment Variable Interpolation

String values in brain.yaml support `${ENV_VAR}` syntax. Variables are resolved from `process.env` (loaded from `.env`).

```yaml
plugins:
  mcp:
    authToken: ${MCP_AUTH_TOKEN} # Resolved at startup
```

If an environment variable is not set, the entire entry is removed. This means plugins gracefully skip when their credentials are missing.

## Required Environment Variables

| Variable            | Required for | Description                        |
| ------------------- | ------------ | ---------------------------------- |
| `ANTHROPIC_API_KEY` | AI features  | Anthropic API key                  |
| `GIT_SYNC_TOKEN`    | Content sync | GitHub personal access token       |
| `MCP_AUTH_TOKEN`    | MCP HTTP     | Token for authenticated MCP access |
| `DISCORD_BOT_TOKEN` | Discord      | Discord bot token                  |

## Examples

### Minimal (local development)

```yaml
brain: rover

plugins:
  mcp:
    authToken: ${MCP_AUTH_TOKEN}
```

### Full Rover instance

```yaml
brain: rover
site: "@brains/site-yeehaa"
preset: pro
domain: yeehaa.io

anchors:
  - "discord:1442828818493735015"

plugins:
  directory-sync:
    git:
      repo: rizom-ai/professional-brain-content
      authToken: ${GIT_SYNC_TOKEN}
      authorName: Yeehaa
      authorEmail: yeehaa@rizom.ai
  mcp:
    authToken: ${MCP_AUTH_TOKEN}
  discord:
    botToken: ${DISCORD_BOT_TOKEN}
  social-media:
    linkedin:
      accessToken: ${LINKEDIN_ACCESS_TOKEN}
  buttondown:
    apiKey: ${BUTTONDOWN_API_KEY}
  analytics:
    cloudflare:
      accountId: ${CLOUDFLARE_ACCOUNT_ID}
      apiToken: ${CLOUDFLARE_API_TOKEN}
      siteTag: ${CLOUDFLARE_ANALYTICS_SITE_TAG}

permissions:
  rules:
    - pattern: "a2a:*"
      level: public
```

### Team brain

```yaml
brain: relay
logLevel: debug

anchors:
  - "discord:1442828818493735015"
trusted:
  - "discord:624315360157499422"

plugins:
  directory-sync:
    git:
      repo: rizom-ai/team-brain-content
      authToken: ${GIT_SYNC_TOKEN}
  mcp:
    authToken: ${MCP_AUTH_TOKEN}
  discord:
    botToken: ${DISCORD_BOT_TOKEN}
```
