# Contributing to Brains

Thanks for your interest in the project.

## Current contribution model

`brains` is currently in **maintainer-only development mode**.

That means:

- bug reports are welcome
- small documentation fixes and typo fixes are welcome
- large feature PRs are generally not accepted right now
- if you want to build something substantial, the best path is usually a fork or a third-party plugin

For the public-facing policy, see [docs/public-release/CONTRIBUTING.md](docs/public-release/CONTRIBUTING.md).

## Local setup

```bash
git clone https://github.com/rizom-ai/brains.git
cd brains
bun install
```

## Required checks

Before opening a PR, run:

```bash
bun run typecheck
bun test
bun run lint
```

Useful extras:

```bash
bun run format
bun run deps:check
bun run workspace:check
```

## Repository layout

High-level structure:

- `shell/` — runtime, services, plugin framework
- `shared/` — shared utilities, themes, UI components, test helpers
- `entities/` — EntityPlugin packages
- `plugins/` — ServicePlugin packages
- `interfaces/` — InterfacePlugin packages
- `brains/` — brain model packages
- `sites/` / `layouts/` — site rendering packages
- `packages/brain-cli/` — published `@rizom/brain` CLI
- `docs/` — architecture, roadmap, plans, and guides

`apps/` contains instance directories and is **not** a workspace category.

## Development guidance

### Documentation and architecture

Start here:

- [README.md](README.md)
- [docs/architecture-overview.md](docs/architecture-overview.md)
- [docs/brain-model.md](docs/brain-model.md)
- [docs/entity-model.md](docs/entity-model.md)
- [docs/roadmap.md](docs/roadmap.md)

### Plugin and interface work

- [plugins/CLAUDE.md](plugins/CLAUDE.md)
- [interfaces/CLAUDE.md](interfaces/CLAUDE.md)
- [docs/plugin-development-patterns.md](docs/plugin-development-patterns.md)
- [docs/plugin-quick-reference.md](docs/plugin-quick-reference.md)
- `plugins/examples/`

## Commit style

Use conventional commits when possible:

- `feat:`
- `fix:`
- `docs:`
- `chore:`
- `refactor:`
- `test:`
- `perf:`

## Security

For security issues, do **not** open a public issue. Follow [docs/public-release/SECURITY.md](docs/public-release/SECURITY.md).
