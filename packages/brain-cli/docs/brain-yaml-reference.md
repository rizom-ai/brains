# brain.yaml Reference

`brain.yaml` is the instance-owned configuration for the canonical brain. It selects fixed capability bundles and applies explicit instance overrides. It does not select a built-in model or preset.

## Example

```yaml
brain: brain
anchor: person
kind: professional
domain: example.com

bundles:
  - core
  - site
  - publishing

add:
  - obsidian-vault
remove:
  - newsletter

site:
  package: "@brains/site-default"
  theme: "@rizom/theme-default"

admins:
  - "discord:123456789"
anchors:
  - "discord:123456789"

plugins:
  directory-sync:
    seedContentPath: ./seed-content
    git:
      repo: your-org/brain-data
      authToken: ${GIT_SYNC_TOKEN}
```

## Canonical selection

### `brain`

Optional for the canonical definition. These are equivalent:

```yaml
brain: brain
```

```yaml
brain: "@rizom/brain/model"
```

When omitted, the runtime uses the canonical definition. Explicitly scoped external definition packages remain an advanced authoring surface. Bare legacy names and internal `@brains/*` definition packages are rejected.

### `bundles`

Required for the canonical definition. Select one or more fixed bundles:

- `core` — knowledge, identity, administration, auth, and interfaces;
- `site` — site metadata, content, building, and analytics;
- `publishing` — blog, series, portfolio, pipeline, newsletter, social, and ATProto publishing;
- `team` — team memory, documents, and trusted collaborative write posture.

Bundle effects compose in canonical definition order, not YAML list order.

```yaml
bundles:
  - core
  - site
  - team
```

### `add` / `remove`

Adjust individual catalog members after bundle composition. `remove` closes that member's config, permissions, instructions, and eval contributions.

```yaml
add:
  - products
remove:
  - analytics
```

Arrays are replaced explicitly; the runtime does not generically merge arrays.

## Identity and runtime fields

### `anchor`

Select the instance's anchor profile flavor:

```yaml
anchor: person # person | team | organization
```

### `name`

Override the runtime instance name.

### `kind`

Select an optional semantic profile kind from the composed catalog. The standard specialized recipes select `professional`, `team`, or `organization`; omit `kind` only when the base profile fields are sufficient. `anchor` controls ownership flavor, while `kind` selects the validated profile field extension.

### `domain`, `port`, `database`

Override deployment domain, production port, or database URL.

### `model`

Select the AI text model. This field is unrelated to the retired built-in brain models.

```yaml
model: anthropic:claude-haiku-4-5-20251001
reasoningEffort: low
```

### `embedding`

Provider-backed semantic indexing is enabled by default. Disable it explicitly for offline or hermetic instances; lexical full-text search remains available.

```yaml
embedding:
  enabled: false
```

Semantic-only operations fail clearly while indexing is disabled.

### `mode`

`mode: eval` disables definition-owned side-effect members for evaluation runs.

### `logLevel`, `logFile`

Configure logging. Levels are `debug`, `info`, `warn`, and `error`.

## Site and theme

```yaml
site:
  package: "@brains/site-default"
  variant: professional
  theme: "@rizom/theme-default"
  themeOverride: ":root { --brand: rebeccapurple; }"
```

All fields are optional. Local `src/site.ts` is always the effective site package when present; an explicit `site.package` becomes its base and the local file layers structural overrides over it. Local `src/theme.css` and `src/site-content.ts` apply when `site.themeOverride` or `plugins.site-content.definitions` is absent, respectively.

## Plugins

Built-in member config is keyed by canonical member ID:

```yaml
plugins:
  directory-sync:
    seedContentPath: ./seed-content
    initialSync: true
```

External plugins use a scoped package plus nested config:

```yaml
plugins:
  calendar:
    package: "@acme/brain-plugin-calendar"
    config:
      timezone: UTC
      apiKey: ${CALENDAR_API_KEY}
```

External packages do not create policy bundles. They remain instance additions governed by the normal permission surface.

## Principals and permissions

Top-level principal seeds:

```yaml
admins:
  - "discord:123"
anchors:
  - "discord:123"
trusted:
  - "discord:456"
spaces:
  - "discord:guild:channel"
```

Structured permissions:

```yaml
permissions:
  admins:
    - "discord:123"
  trusted:
    - "discord:456"
  rules:
    - pattern: "mcp:http"
      level: public
  entityActions:
    note:
      create: trusted
      update: trusted
      delete: admin
      extract: admin
      publish: admin
```

Principal seeds are unioned. Effective policy follows plugin, definition, bundle, then instance precedence, subject to validation that publishing cannot be looser than updating.

## Environment interpolation

`${NAME}` references are resolved from the environment. Unset values are removed rather than converted to the string `"undefined"`.

```yaml
plugins:
  discord:
    botToken: ${DISCORD_BOT_TOKEN}
```

Common variables include `AI_API_KEY`, `AI_IMAGE_KEY`, `GIT_SYNC_TOKEN`, `DISCORD_BOT_TOKEN`, and provider/integration-specific secrets declared by `.env.schema`.

## Recipes

Recipes are scaffold-time conveniences only. `brain init --recipe` expands them into explicit YAML; recipe names have no runtime meaning.

| Recipe     | Expansion                      |
| ---------- | ------------------------------ |
| `minimal`  | `core`                         |
| `personal` | `core + site + publishing`     |
| `team`     | `core + site + team`           |
| `commerce` | `core + site`, plus `products` |

Identity, seed content, site, theme, permissions, and secret references remain visible instance-owned choices.

## Legacy migration

Preview an old built-in model/preset config without writing it:

```bash
brain config migrate
```

Review the output, then apply it deliberately. The active runtime does not parse the retired preset contract.
