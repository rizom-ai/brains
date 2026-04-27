# brains

**Run an AI knowledge agent from your own markdown.**

`brains` is a Bun-first framework for self-hosted AI agents centered on durable content, MCP-native tooling, static-site publishing, and plugin-based composition. It lets you keep content as markdown files, expose that content to assistants over MCP, publish a site from the same source, and deploy the whole thing as one brain instance.

> **Status:** `brains` is pre-stable in the `0.x` series. The framework is usable today, but APIs and package surfaces will keep changing before `1.0`. See [STABILITY.md](STABILITY.md).

## What this is for

- building a personal or site-oriented AI agent around content you own
- storing knowledge as markdown entities instead of locking it into a SaaS
- exposing tools and resources to Claude Desktop, Cursor, and other MCP clients
- publishing a static site from the same content graph
- extending behavior with entity, service, and interface plugins
- self-hosting on your own machine or a small VM

## What this is not for

- a hosted product or managed SaaS
- a generic multi-tenant agent platform
- an autonomous-agent research framework
- a drop-in Notion or Obsidian replacement
- a stable plugin SDK yet

## Quickstart

```bash
bun add -g @rizom/brain
brain init mybrain --model rover
cd mybrain
cp .env.example .env
# set AI_API_KEY in .env
brain start
```

That gives you a runnable brain instance with:

- `brain.yaml` for instance config
- `package.json` pinned to `@rizom/brain`
- `.env.example`, `.gitignore`, and `tsconfig.json`
- `brain-data/` markdown content created/seeded on first run when directory-sync is active

Some models also scaffold `src/site.ts` and `src/theme.css` for local site/theme authoring.

For the full setup flow, see [packages/brain-cli/docs/getting-started.md](packages/brain-cli/docs/getting-started.md).

## Connect from an MCP client

Use the generated instance directory as the working directory and run the normal start command:

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

## How it works

```text
brain.yaml (instance config)
  + brain model
  = running brain
    ├── Entity plugins    typed markdown content
    ├── Service plugins   tools, jobs, integrations, site building
    └── Interface plugins MCP, web, Discord, A2A, chat REPL
```

A **brain model** is a curated package of plugins and defaults.

A **brain instance** is a deployment of that model, configured in `brain.yaml` with its own domain, secrets, content, and optional site/theme overrides.

A **typed entity** is markdown plus schema-backed frontmatter, indexed for search and exposed to tools, resources, and site rendering.

## Repository layout

```text
shell/                core runtime, orchestration, services, plugin lifecycle
shared/               shared utilities, themes, UI, test helpers
entities/             built-in entity plugins
plugins/              built-in service plugins
interfaces/           built-in interface plugins
brains/               brain model packages
sites/                structural site packages
packages/brain-cli/   published CLI and runtime package: @rizom/brain
deploy/               deployment recipes and templates
docs/                 architecture, theming, roadmap, plans
apps/                 example/runtime instance directories, not workspace packages
```

## Shipped models

- `rover` — public reference model for personal knowledge and publishing
- `ranger` — internal-use model for the rizom.ai app
- `relay` — internal-use model for the rizom-foundation app

Use **`rover`** as the external reference model.

## Documentation

### Start here

- [Documentation Index](docs/README.md)
- [Getting Started](packages/brain-cli/docs/getting-started.md)
- [brain.yaml Reference](packages/brain-cli/docs/brain-yaml-reference.md)
- [CLI Reference](packages/brain-cli/docs/cli-reference.md)
- [Deployment Guide](packages/brain-cli/docs/deployment-guide.md)

### Architecture

- [Architecture Overview](docs/architecture-overview.md)
- [Brain Models](docs/brain-model.md)
- [Entity Model](docs/entity-model.md)
- [Entity Types Reference](docs/entity-types-reference.md)
- [Content Management Guide](docs/content-management.md)
- [Interface Setup Guide](docs/interface-setup.md)
- [Customization Guide](docs/customization-guide.md)
- [Plugin System](docs/plugin-system.md)
- [Plugin Development Patterns](docs/plugin-development-patterns.md)
- [Theming Guide](docs/theming-guide.md)
- [Roadmap](docs/roadmap.md)

## Compatibility

| Requirement | Support                        |
| ----------- | ------------------------------ |
| Bun         | `>= 1.3.3`                     |
| OS          | macOS, Linux, Windows via WSL2 |
| Runtime     | Bun only                       |

## Contributing

This project is currently in maintainer-led development. Bug reports, documentation fixes, and focused patches are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[Apache-2.0](LICENSE)
