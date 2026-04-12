# brains roadmap

Last updated: 2026-04-12

This roadmap is the public-facing view of where `brains` is headed.

It focuses on product direction and release readiness, not internal task-by-task tracking. For implementation detail, see the linked plan docs in `docs/plans/`.

## Current status

`brains` is approaching its first public `v0.1.0` release. The deploy-validation gate has been cleared: `rizom.ai`, `mylittlephoney.com`, and `yeehaa.io` are live on their intended production paths. Even so, public-release staging is paused while nearer-term product work takes priority.

What already exists today:

- an alpha-published Bun-based CLI and runtime via `@rizom/brain`
- markdown-backed entities with typed frontmatter
- MCP-native tools and resources
- built-in webserver, A2A, Discord, and chat REPL interfaces
- static-site generation with reusable site + theme packages
- rover as the public reference brain model
- Kamal-based self-hosted deploy scaffolding, including app-local deploy artifacts, env-schema generation, and Cloudflare Origin CA bootstrap support
- published-path support for standalone brain authoring

## Recently completed

These areas are effectively landed:

- **Entity and plugin architecture** — unified `EntityPlugin` / `ServicePlugin` / `InterfacePlugin` split
- **System tool surface** — create, update, delete, search, extract, status, and insights consolidated into framework-level tools
- **Search and embeddings** — SQLite FTS + online embeddings + diagnostics
- **Eval overhaul** — app/model/shell eval layering and comparison reporting
- **Theme/site decoupling** — site packages are structural-only; themes resolve independently
- **Standalone authoring** — local `src/site.ts`, `src/theme.css`, and deploy scaffolding conventions, scaffolded by `brain init`
- **Alpha npm publishing** — `@rizom/brain` is already shipping public alpha releases with automated Changesets-based publishing
- **Library exports Tier 1** — `@rizom/brain/site` and `@rizom/brain/themes`
- **Deployment foundation** — `brain cert:bootstrap`, app-local `.env.schema` generation, init artifact reconciliation, and the first standalone Kamal workflow shape
- **Production deploy validation** — `rizom.ai`, `mylittlephoney.com`, and `yeehaa.io` are live on their intended production paths
- **Monorepo cleanup** — transitional apps/packages removed; `mylittlephoney` and `yeehaa.io` extracted

## Near-term priorities

### 1. Deployment path polish

Keep tightening the self-hosted deployment story first, because it most directly affects whether new users can get a brain running reliably.

Focus areas:

- converge app-local deploy workflows with the newer `brain init --deploy` scaffold where they have drifted
- operator-facing verification and troubleshooting guidance drawn from the now-live instances
- polish the first-run deploy path for new external users

Plan:

- [standalone-apps.md](./plans/standalone-apps.md)

### 2. Rizom site variants

Continue the shared-site work across the Rizom family once the deploy path is in a good place.

Focus areas:

- keep `sites/rizom` as the shared structural spine
- finish the intended variant split across `rizom.ai`, `rizom.foundation`, and `rizom.work`
- keep brand/theme decisions cleanly separated from per-instance configuration

This work now lives directly in the shared `sites/rizom` + `shared/theme-rizom` packages.

### 3. Public plugin surface

Open a cleaner public extension story after the more immediate user-facing work above.

Focus areas:

- more library subpaths
- clearer plugin authoring contract
- runtime loading for external plugins
- external plugin examples and docs

Plans:

- [library-exports.md](./plans/library-exports.md)
- [external-plugin-api.md](./plans/external-plugin-api.md)

### 4. Public release cleanup and stable release path

This work is intentionally on hold until the nearer-term product work above is complete.

Remaining work after that:

- Phase 2 backup
- release staging to `brains-temp`
- clean-machine smoke test from the published path
- final rename / go-live flow

Plan:

- [public-release-cleanup.md](./plans/public-release-cleanup.md)

### 5. Documentation phase 2

After the public release baseline is in place, fill the remaining user-facing docs:

- entity type reference
- content-management guidance
- interface setup guides
- deeper customization docs for themes, layouts, and plugins

Plan:

- [documentation.md](./plans/documentation.md)

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
