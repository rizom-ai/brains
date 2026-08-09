# Getting Started

## What is a Brain?

A brain is a private AI runtime whose durable knowledge is markdown. One canonical definition supplies the capability catalog; each instance selects explicit bundles and keeps identity, content, site, theme, permissions, and integrations visible in `brain.yaml`.

## Prerequisites

- Bun 1.3.3 or newer
- an API key supported by the configured AI provider

## Quick start

```bash
bun add -g @rizom/brain
brain init my-brain --recipe personal
cd my-brain
# edit .env and set AI_API_KEY
brain start
```

`brain init` writes explicit bundle selection. Recipes are compile-time scaffolding only.

## Recipes

```bash
brain init minimal-brain --recipe minimal
brain init personal-brain --recipe personal
brain init team-brain --recipe team
brain init shop-brain --recipe commerce
```

| Recipe     | Canonical selection             |
| ---------- | ------------------------------- |
| `minimal`  | `core`                          |
| `personal` | `core`, `site`, `publishing`    |
| `team`     | `core`, `site`, `team`          |
| `commerce` | `core`, `site`, plus `products` |

Each recipe also copies instance-owned starter content into `seed-content/`.

## What `brain init` creates

- `brain.yaml` — explicit bundles and instance overrides
- `seed-content/` — recipe-owned first-boot markdown
- `package.json` — pinned `@rizom/brain` dependency
- `.env.example` and `.env.schema` — environment contract
- `.gitignore` and `tsconfig.json`
- `src/site.tsx` and `src/theme.css` for site-enabled recipes
- optional deployment files with `--deploy`

## Init options

```text
--recipe <name>        minimal | personal | team | commerce
--domain <domain>      defaults to {directory}.rizom.ai
--content-repo <repo>  owner/name or github:owner/name
--backend <name>       secret backend; default none
--ai-api-key <key>     writes the initial local .env
--deploy               include deployment scaffolding
--regen                regenerate derived deployment files
--no-interactive       disable prompts
```

## Configuration

A personal instance starts with YAML like:

```yaml
brain: brain
anchor: person
kind: professional
bundles:
  - core
  - site
  - publishing
site:
  package: "@brains/site-default"
  theme: "@rizom/theme-default"
plugins:
  directory-sync:
    seedContentPath: ./seed-content
```

See [brain.yaml Reference](./brain-yaml-reference.md) for all fields.

## Common next steps

- add a content repository with `plugins.directory-sync.git`;
- configure Discord or another interface;
- customize local site and theme files;
- run `brain cert:bootstrap` and `brain secrets:push` before deployment;
- use `brain config migrate` to preview an old configuration before applying it.
