# Getting Started

## What is a Brain?

A brain is an AI-powered knowledge agent built around markdown content, MCP-native tooling, and a plugin-based runtime. A brain can be personal, team-oriented, or community-oriented depending on the brain model you choose.

Out of the box, a brain can:

- store durable content as markdown entities
- expose tools and resources over MCP
- serve a static site and CMS
- sync content to git
- talk to AI providers through one runtime
- expose additional interfaces such as Discord or A2A

Brains currently come in three model flavors:

- **Rover** — personal publishing + knowledge management
- **Relay** — team/shared knowledge workflows
- **Ranger** — collective/discovery-oriented brains

## Prerequisites

- [Bun](https://bun.sh) `>= 1.3.3`
- [Git](https://git-scm.com) if you want git-backed content sync
- An AI provider key exposed as `AI_API_KEY`

Optional:

- a GitHub repo for `directory-sync`
- a Discord bot token for the Discord interface
- a domain + server if you want to deploy publicly

## Quick start

```bash
# Install the CLI
bun add -g @rizom/brain

# Scaffold a new brain
brain init mybrain
cd mybrain

# Add your AI key
cp .env.example .env
# edit .env and set AI_API_KEY

# Start the brain
brain start
```

The generated `brain.yaml` defaults to `preset: core`, which is the minimal, usable on-ramp.

## What `brain init` creates

A new brain instance is a **lightweight instance package**. It is not a workspace package, but it does carry conventional support files for local execution and optional deploy scaffolding.

Typical scaffold:

```text
mybrain/
  brain.yaml        # instance configuration
  package.json      # pins @rizom/brain + preact for local execution
  README.md         # local quickstart notes
  .env.example      # environment variables to fill in
  .gitignore        # ignores .env, cache, build artifacts
  tsconfig.json     # JSX runtime hints for Preact-based site code
```

Some models also scaffold local site/theme authoring files:

```text
mybrain/
  src/site.ts       # local site composition built on @rizom/brain/site
  src/theme.css     # additive local theme override
```

When these files exist, `src/theme.css` layers on top of the active base theme. A local `src/site.ts` is discovered by convention when `brain.yaml` does not set `site.package`.

With `--deploy`, the scaffold also includes deployment helpers for the Kamal flow: `config/deploy.yml`, `.kamal/hooks/pre-deploy`, `deploy/Dockerfile`, `.github/workflows/publish-image.yml`, and `.github/workflows/deploy.yml`. The generated `.env.schema` defaults to `--backend none`, which means varlock validates and normalizes values supplied directly from local env files or GitHub Actions secrets.

The proven operator flow is:

1. set local deploy values in `.env.local`
2. set `KAMAL_SSH_PRIVATE_KEY_FILE=~/.ssh/<site>_deploy_ed25519`
3. run `brain ssh-key:bootstrap --push-to gh`
4. run `brain secrets:push --push-to gh --dry-run`
5. run `brain secrets:push --push-to gh`
6. run `brain cert:bootstrap --push-to gh`
7. push to `main` so `Publish Image` and then `Deploy` run in GitHub Actions

After `brain init`, you can either:

- keep using the globally installed `brain` command immediately, or
- run `bun install` in the new directory and then use `bunx brain start` / `bun run start` against the pinned local version

## Init options

```bash
brain init <directory> [options]

Options:
  --model <name>         Brain model: rover (default), relay, ranger
  --domain <domain>      Production domain
  --content-repo <repo>  Git repo for content sync
  --backend <name>       Secret backend plugin (default: none)
  --deploy               Include deployment scaffolding
  --regen                Refresh generated deploy scaffolding files
  --ai-api-key <key>     Write an initial .env with AI_API_KEY
  --no-interactive       Skip prompts and use supplied/default values
```

## Configuration

All instance-specific configuration lives in `brain.yaml`.

Minimal example:

```yaml
brain: rover
domain: mybrain.example.com
preset: core

anchors: []

plugins:
  # Uncomment to enable git-backed content sync:
  # directory-sync:
  #   git:
  #     repo: your-org/brain-data
  #     authToken: ${GIT_SYNC_TOKEN}
  mcp:
    authToken: ${MCP_AUTH_TOKEN}
```

Secrets are referenced with `${ENV_VAR}` interpolation and loaded from `.env`.

For the full schema, see [brain.yaml Reference](./brain-yaml-reference.md).

## Interfaces

Once running, a brain can be accessed through several surfaces depending on the selected model and configured plugins.

| Interface     | Access                                              | Notes                                                     |
| ------------- | --------------------------------------------------- | --------------------------------------------------------- |
| **Web**       | `http://localhost:8080`                             | Shared HTTP surface: site, CMS, dashboard, API routes     |
| **MCP**       | stdio or `http://localhost:8080/mcp`                | Connect from Claude Desktop, Cursor, or other MCP clients |
| **Chat REPL** | `brain chat`                                        | Local terminal conversation loop                          |
| **Discord**   | Bot in a server                                     | Requires Discord credentials                              |
| **A2A**       | `http://localhost:8080/.well-known/agent-card.json` | Agent-to-agent protocol                                   |

## Common next steps

- [Documentation Index](../../../docs/README.md)
- [brain.yaml Reference](./brain-yaml-reference.md)
- [Entity Types Reference](../../../docs/entity-types-reference.md)
- [Content Management Guide](../../../docs/content-management.md)
- [Interface Setup Guide](../../../docs/interface-setup.md)
- [Customization Guide](../../../docs/customization-guide.md)
- [CLI Reference](./cli-reference.md)
- [Deployment Guide](./deployment-guide.md)
