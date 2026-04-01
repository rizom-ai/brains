# Getting Started

## What is a Brain?

A brain is an AI-powered knowledge management system. It stores your content as markdown files, syncs with Git, generates a static website, and exposes everything through conversational interfaces (CLI, Discord, MCP, agent-to-agent).

Brains come in three flavors:

- **Rover** — personal brain for individuals (blog, portfolio, decks, notes, links)
- **Relay** — team brain for organizations (shared knowledge, summaries, decks)
- **Ranger** — collective brain for communities (curated content, discovery)

## Prerequisites

- [Bun](https://bun.sh) v1.1+ (runtime)
- [Git](https://git-scm.com) (for content sync)
- An [Anthropic API key](https://console.anthropic.com) (for AI features)

Optional:

- A GitHub repo for content storage (directory-sync)
- A Discord bot token (for Discord interface)
- A Hetzner server + domain (for deployment)

## Quick Start

```bash
# Install the CLI
bun install -g @rizom/brain

# Scaffold a new brain instance
brain init mybrain
cd mybrain

# Add your API key
cp .env.example .env
# Edit .env and add ANTHROPIC_API_KEY

# Start the brain
brain start
```

This starts all configured daemons: webserver, MCP server, Discord bot (if configured), and A2A endpoint.

## What gets scaffolded

```
mybrain/
  brain.yaml        # Instance configuration
  package.json      # Dependencies (brain model)
  .env.example      # Required/optional environment variables
  .gitignore        # Excludes .env and node_modules
```

With `--deploy`:

```
mybrain/
  ...
  deploy.yml                    # Kamal deployment config
  .kamal/hooks/pre-deploy       # Uploads brain.yaml to server
  .github/workflows/deploy.yml  # CI/CD pipeline
```

## Init Options

```bash
brain init <directory> [options]

Options:
  --model <name>         Brain model: rover (default), relay, ranger
  --domain <domain>      Production domain (default: {model}.rizom.ai)
  --content-repo <repo>  Git repo for content (e.g. github:user/brain-data)
  --deploy               Include Kamal deployment files
```

## Configuration

All instance-specific configuration lives in `brain.yaml`. See [brain.yaml Reference](./brain-yaml-reference.md) for the full schema.

Minimal example:

```yaml
brain: rover
domain: mybrain.example.com

anchors: []

plugins:
  directory-sync:
    git:
      repo: your-org/brain-data
      authToken: ${GIT_SYNC_TOKEN}
  mcp:
    authToken: ${MCP_AUTH_TOKEN}
```

Secrets use `${ENV_VAR}` interpolation — define them in `.env`, reference them in `brain.yaml`.

## Interfaces

Once running, your brain is accessible through:

| Interface   | Access                                  | Notes                                          |
| ----------- | --------------------------------------- | ---------------------------------------------- |
| **Web**     | `http://localhost:4321`                 | Static site + CMS                              |
| **MCP**     | stdio or HTTP                           | Connect to Claude Desktop or other MCP clients |
| **CLI**     | `brain chat`                            | Interactive terminal REPL                      |
| **Discord** | Invite bot to server                    | Requires `DISCORD_BOT_TOKEN`                   |
| **A2A**     | `https://domain/.well-known/agent.json` | Agent-to-agent protocol                        |

## Next Steps

- [brain.yaml Reference](./brain-yaml-reference.md) — configure your brain
- [CLI Reference](./cli-reference.md) — all available commands
- [Deployment Guide](./deployment-guide.md) — deploy to production
