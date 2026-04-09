# brains roadmap

Last updated: 2026-04-07

This roadmap is the public-facing view of where `brains` is headed.

It focuses on product direction and release readiness, not internal task-by-task tracking. For implementation detail, see the linked plan docs in `docs/plans/`.

## Current status

`brains` is approaching its first public `v0.1.0` release.

What already exists today:

- a Bun-based CLI and runtime via `@rizom/brain`
- markdown-backed entities with typed frontmatter
- MCP-native tools and resources
- built-in webserver, A2A, Discord, and chat REPL interfaces
- static-site generation with reusable site + theme packages
- rover as the public reference brain model
- deploy recipes for self-hosted operation
- published-path support for standalone site authoring

## Recently completed

These areas are effectively landed:

- **Entity and plugin architecture** — unified `EntityPlugin` / `ServicePlugin` / `InterfacePlugin` split
- **System tool surface** — create, update, delete, search, extract, status, and insights consolidated into framework-level tools
- **Search and embeddings** — SQLite FTS + online embeddings + diagnostics
- **Eval overhaul** — app/model/shell eval layering and comparison reporting
- **Theme/site decoupling** — site packages are structural-only; themes resolve independently
- **Standalone authoring** — local `src/site.ts` and `src/theme.css` conventions, scaffolded by `brain init`
- **Library exports Tier 1** — `@rizom/brain/site` and `@rizom/brain/themes`
- **Monorepo cleanup** — transitional apps/packages removed; `mylittlephoney` extracted

## Near-term priorities

### 1. Public release cleanup

Finish the last launch-prep work for `v0.1.0`:

- top-level public docs
- release staging to `brains-temp`
- clean-machine smoke test from the published path
- final rename / go-live flow

Plan: [public-release-cleanup.md](./plans/public-release-cleanup.md)

### 2. Deployment path polish

Keep tightening the self-hosted deployment story:

- Cloudflare Origin CA bootstrap flow
- first full `brain init --deploy` path on the current Kamal setup
- app-local env/schema handling

Plans:

- [deploy-kamal.md](./plans/deploy-kamal.md)
- [standalone-apps.md](./plans/standalone-apps.md)

### 3. Documentation phase 2

After the public release baseline is in place, fill the remaining user-facing docs:

- entity type reference
- content-management guidance
- interface setup guides
- deeper customization docs for themes, layouts, and plugins

Plan: [documentation.md](./plans/documentation.md)

### 4. External plugin surface

Open a cleaner public extension story beyond the current Tier 1 exports:

- more library subpaths
- clearer plugin authoring contract
- external plugin examples and docs

Plans:

- [library-exports.md](./plans/library-exports.md)
- [external-plugin-api.md](./plans/external-plugin-api.md)

## Product direction

The project is intentionally opinionated.

`brains` is being shaped around:

- self-hosted AI knowledge agents
- markdown as durable source of truth
- MCP as the default assistant integration layer
- one-brain-per-instance deployment
- strong plugin boundaries instead of ad hoc app code
- site publishing from the same content graph that powers the agent

It is **not** currently targeting:

- multi-tenant SaaS hosting
- generic autonomous-agent orchestration
- a fully stable plugin SDK before `1.0`

## Reference models

- **`rover`** — the public reference model
- **`ranger`** — internal-use source model for `rizom-ai`
- **`relay`** — internal-use source model for `rizom-foundation`

External examples and docs should treat **`rover`** as the main reference.

## Stability

The framework is pre-stable in the `0.x` series.

See:

- [STABILITY.md](../STABILITY.md)
- [CHANGELOG.md](../CHANGELOG.md)

## Related docs

- [README](../README.md)
- [Architecture Overview](./architecture-overview.md)
- [Brain Models](./brain-model.md)
- [Entity Model](./entity-model.md)
- [Plugin System](./plugin-system.md)
- [Theming Guide](./theming-guide.md)
