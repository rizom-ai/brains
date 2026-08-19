# brains

**A self-hosted AI knowledge agent that reads and writes your markdown.**

`brains` lets you run an AI assistant around files you own. Your notes, posts, pages, images, and profile data live as markdown in a local `brain-data/` folder. The running brain can search that content, update it, expose it to tools like Claude or Cursor, and publish a static website from the same source.

> **Status:** pre-stable `0.x`. It works today, but APIs and package names can still change before `1.0`. See [STABILITY.md](STABILITY.md).

## Who this is for

Use `brains` if you want to:

- keep your knowledge in markdown instead of a hosted app
- run a personal or site-focused AI assistant on your own machine or server
- connect that assistant to Claude Desktop, Cursor, or other MCP clients
- publish a website from the same content the assistant uses
- customize behavior with plugins when the defaults are not enough

It is **not** a hosted SaaS, a Notion/Obsidian clone, or a stable third-party plugin platform yet.

## Quickstart

Install Bun first, then:

```bash
bun add -g @rizom/brain
brain init mybrain --recipe personal
cd mybrain
cp .env.example .env
# edit .env and set AI_API_KEY
brain start
```

This creates a new brain instance with:

- `brain.yaml` — main configuration
- `.env.example` and `.env.schema` — environment/secrets reference
- `package.json` — pins the runtime package
- `tsconfig.json`, `.gitignore`, and a local `README.md`
- `brain-data/` — created/seeded on first run when file sync is active

On first start, site-enabled instances print a one-time `/setup` URL. Open it locally, register a passkey, and use that passkey for browser and OAuth-based MCP access. Auth state is stored in `./data/auth`; keep it when deploying or backing up.

For the full walkthrough, see [Getting Started](packages/brain-cli/docs/getting-started.md).

## Connect Claude, Cursor, or another MCP client

MCP is the protocol many AI apps use to connect to external tools and data.

For local stdio MCP, point the client at your brain directory:

```json
{
  "mcpServers": {
    "mybrain": {
      "command": "brain",
      "args": ["start"],
      "cwd": "/absolute/path/to/mybrain"
    }
  }
}
```

For HTTP MCP, use:

```text
http://localhost:8080/mcp
```

or, after deployment:

```text
https://your-domain.com/mcp
```

OAuth-capable clients can use the built-in browser/passkey login. `MCP_AUTH_TOKEN` still exists as a legacy fallback for clients that cannot use OAuth.

## How it works

A brain has three main pieces:

1. **Content** — markdown files in `brain-data/`
2. **Definition + bundles** — one ordered catalog with explicit `core`, `site`, `publishing`, and `team` selection
3. **Runtime** — the `brain` process that resolves selection, indexes content, serves tools, and optionally builds a site

```text
brain.yaml + brain-data/
  → brain start
  → running AI knowledge agent
     ├─ content tools
     ├─ MCP endpoint
     ├─ optional web dashboard / site
     └─ optional integrations like Discord
```

## Recipes and postures

- `minimal` — `core`
- `personal` — `core + site + publishing`
- `team` — `core + site + team`
- `commerce` — `core + site`, plus `products`

If you are trying `brains` for the first time, use `brain init --recipe personal`. Recipes expand to explicit YAML and have no runtime meaning.

## Documentation

Start here:

- [Documentation Index](docs/README.md)
- [Getting Started](packages/brain-cli/docs/getting-started.md)
- [brain.yaml Reference](packages/brain-cli/docs/brain-yaml-reference.md)
- [CLI Reference](packages/brain-cli/docs/cli-reference.md)
- [Deployment Guide](packages/brain-cli/docs/deployment-guide.md)

Deeper topics:

- [Architecture Overview](docs/architecture-overview.md)
- [Brain Definition & Instances](docs/brain-model.md)
- [Content Management](docs/content-management.md)
- [Entity Types Reference](docs/entity-types-reference.md)
- [Interface Setup](docs/interface-setup.md)
- [Customization Guide](docs/customization-guide.md)
- [Plugin System](docs/plugin-system.md)
- [External Plugin Authoring](docs/external-plugin-authoring.md)
- [Theming Guide](docs/theming-guide.md)
- [Roadmap](docs/roadmap.md)

## Repository map

This is mainly useful if you are developing the framework itself:

```text
packages/brain-cli/    canonical definition, recipes, assets, and @rizom/brain CLI/runtime
packages/brains-ops/   operator CLI for fleets: @rizom/ops
shell/                 core runtime and services
plugins/               built-in service plugins
entities/              built-in content/entity plugins
interfaces/            built-in interfaces: MCP, web, Discord, etc.
shared/                shared utilities, UI, themes, site engine
sites/                 site packages
deploy/                deployment templates and helper scripts
docs/                  documentation and plans
apps/                  local development / legacy instance directories
```

## Requirements

| Requirement | Support                        |
| ----------- | ------------------------------ |
| Bun         | `>= 1.3.3`                     |
| Runtime     | Bun only                       |
| OS          | macOS, Linux, Windows via WSL2 |

## Contributing

This project is currently maintainer-led. Bug reports, documentation fixes, and focused patches are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

This repository uses a split licensing model:

- **Core** — the runtime, brain models, agents, interfaces, plugins, the `@rizom/brain` CLI, deploy tooling, and apps — is licensed under [AGPL-3.0-only](LICENSE).
- **SDK and contract packages** — `@rizom/site`, `@rizom/theme-default`, `@rizom/theme-rizom-ai`, `@brains/contracts`, and `@brains/atproto-contracts` — are licensed under Apache-2.0 (see the `LICENSE` file in each package directory).

Plugins, themes, and site packages built against the Apache-licensed interfaces are **not** considered derivative works of the runtime and may be licensed however their authors choose. In particular, importing types and interfaces from `@rizom/brain` for the purpose of authoring a plugin, theme, or site package does not, by itself, make the resulting work a derivative of the AGPL-licensed runtime.

Copyright © Rizom B.V.

The Rizom name and logo are trademarks; see [TRADEMARKS.md](TRADEMARKS.md).
