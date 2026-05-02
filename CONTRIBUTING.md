# Contributing to brains

`brains` is currently in **maintainer-led development**.

That means:

- bug reports are welcome
- documentation fixes are welcome
- small, clearly scoped fixes are welcome
- large feature PRs are usually not accepted without prior discussion
- third-party plugins should usually live in their own repos, not this monorepo

If you want to build something substantial today, the fastest path is usually a fork or an external plugin package.

## Before you open anything

### Open an issue for

- bugs with a clear reproduction
- documentation problems
- focused design questions
- requests for missing extension points

### Open a PR for

- typo fixes
- broken links
- narrow bug fixes that match an existing issue or discussion
- targeted docs improvements

### Do not open a large unsolicited PR for

- broad refactors
- new official plugins
- major architecture changes
- new product directions

Start with an issue instead.

## Security

Do **not** file public issues for vulnerabilities.

Follow [SECURITY.md](SECURITY.md).

## Local setup

```bash
git clone https://github.com/rizom-ai/brains.git
cd brains
bun install
```

Requirements:

- **Bun** `>= 1.3.3`
- macOS or Linux, or Windows via WSL2

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
bun run docs:links
bun run deps:check
bun run workspace:check
```

## Changesets

If your change is user-visible, add a changeset:

```bash
bunx changeset
```

Examples of user-visible changes:

- new CLI behavior
- new exported APIs
- changed config behavior
- changed runtime behavior
- docs announcing a new supported workflow

## Repository layout

High-level structure:

- `shell/` — runtime, orchestration, services, plugin framework
- `shared/` — utilities, themes, UI components, test helpers
- `entities/` — `EntityPlugin` packages
- `plugins/` — `ServicePlugin` packages
- `interfaces/` — `InterfacePlugin` packages
- `brains/` — brain model packages
- `sites/` — site composition packages
- `packages/brain-cli/` — published `@rizom/brain` package
- `apps/` — lightweight instance packages, not workspace members
- `docs/` — architecture, roadmap, plans, and guides

For the fuller package map, see [docs/architecture/package-structure.md](docs/architecture/package-structure.md).

## Development guidance

Start here:

- [README.md](README.md)
- [docs/architecture-overview.md](docs/architecture-overview.md)
- [docs/brain-model.md](docs/brain-model.md)
- [docs/entity-model.md](docs/entity-model.md)
- [docs/plugin-system.md](docs/plugin-system.md)
- [docs/external-plugin-authoring.md](docs/external-plugin-authoring.md)
- [docs/roadmap.md](docs/roadmap.md)

For example code:

- `plugins/examples/`
- `shell/plugins/src/test/`

## Code conventions

Follow the existing project rules:

- TypeScript strict mode
- Zod for runtime validation
- no `eslint-disable` comments
- no casual `as` casts; model the types properly
- no `console.log` in production code
- test behavior, not implementation details
- keep changes narrow and architectural intent explicit

## PR expectations

A good PR has:

- a clear problem statement
- a focused diff
- tests for behavior changes
- updated docs when public behavior changes
- a changeset when users will notice the change

Use conventional commits when possible:

- `feat:`
- `fix:`
- `docs:`
- `chore:`
- `refactor:`
- `test:`
- `perf:`

## Plugin contributions

The preferred way to extend `brains` is often an external plugin package.

Useful references:

- [docs/plugin-system.md](docs/plugin-system.md)
- [docs/external-plugin-authoring.md](docs/external-plugin-authoring.md)
- [docs/plugin-quick-reference.md](docs/plugin-quick-reference.md)
- `plugins/examples/`

## Response expectations

This is a solo-maintained project. Expect best-effort response times, not a staffed support queue.
