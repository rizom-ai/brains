# brains roadmap

Last updated: 2026-04-21

This roadmap is the public-facing view of where `brains` is headed.

It focuses on product direction and release readiness, not internal task-by-task tracking. For implementation detail, see the linked plan docs in `docs/plans/`.

## Current status

`brains` is approaching its first stable `v0.2.0` release. The deploy-validation gate has been cleared: `rizom.ai`, `mylittlephoney.com`, and `yeehaa.io` are live on their intended production paths, and the extracted deployment repos now match the shared HTTP-host shape used by the current scaffold. `@rizom/brain` is already publishing public alpha releases via changesets, so "launch" here means the current alpha cycle matures into a stable `v0.2.0` — not a repo-rename ceremony.

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
- **Plugin create interceptors** — plugins can override `system_create` behavior per entity type via `EntityPlugin.interceptCreate`; link capture and image cover-target resolution moved into their respective plugins
- **Knowledge-context opt-in** — AI templates explicitly opt in to knowledge-base context injection, replacing an implicit default that caused embedding-API overflows on long extractive prompts
- **Search and embeddings** — SQLite FTS + online embeddings + diagnostics
- **Eval overhaul** — app/model/shell eval layering and comparison reporting
- **Theme/site decoupling** — site packages are structural-only; themes resolve independently
- **Standalone authoring** — local `src/site.ts`, `src/theme.css`, and deploy scaffolding conventions, scaffolded by `brain init`
- **Alpha npm publishing** — `@rizom/brain` is already shipping public alpha releases with automated Changesets-based publishing
- **Library exports Tier 1** — `@rizom/brain/site` and `@rizom/brain/themes`
- **Deployment foundation** — `brain cert:bootstrap`, app-local `.env.schema` generation, init artifact reconciliation, and the first standalone Kamal workflow shape
- **Multi-user fleet operations** — `@rizom/ops` for operator-managed rover fleets: shared wildcard TLS with `<handle>-preview.<zone>` preview routing, age-encrypted per-user secret files, content repo auto-create with anchor profile seeding, Discord anchor support, preview-domain routing aligned across deploy paths
- **Production deploy validation** — `rizom.ai`, `mylittlephoney.com`, and `yeehaa.io` are live on their intended production paths
- **Extracted deploy convergence** — the checked-out external deployments now use the shared HTTP-host shape: `app_port: 8080`, no active in-container `Caddyfile`, and direct `brain start` boot
- **Rizom site core consolidation** — `rizom.ai`, `rizom.foundation`, and `rizom.work` now own their final route composition from app-local `src/site.ts`, over the shared `sites/rizom` core with `shared/theme-rizom` kept separate
- **Monorepo cleanup** — transitional apps/packages removed; `rizom.ai`, `rizom.work`, `mylittlephoney`, and `yeehaa.io` extracted
- **Agent directory tightening** — outbound A2A calls now resolve only from saved local directory entries; explicit user add/save flows approve that saved agent, discovery/review flows can remain `discovered`, invalid agent-contact requests no longer fall back to wishlist creation, and explicit-save generation jobs are idempotent/coalesced

## Near-term priorities

### 1. Rizom site variant follow-through

The Rizom architecture cleanup is now in place: `sites/rizom` owns the shared site core, each Rizom app owns its final composition from local `src/site.ts`, and `shared/theme-rizom` remains the separate shared theme. Additive local theme layering is also in place, with app-local overrides only where needed (`rizom-foundation`, plus the already-extracted `rizom.work`) and no forced `rizom-ai` theme fork. The next step is no longer a combined `rizom-sites` extraction. The current direction is to keep `sites/rizom` in `brains` as the shared reusable package, then extract the remaining deployable Rizom apps into separate per-app repos.

Focus areas:

- keep the shared/core boundary stable: `sites/rizom` for shared site structure, app-local `src/site.ts` for variants, `shared/theme-rizom` for theme
- complete the Rizom theme-hardening work before extraction so the shared theme/profile API no longer leaks app names
- make the shared Rizom site/theme layer consumable by app repos without depending on monorepo-only workspace wiring
- extract the Rizom apps one by one for deploy isolation, starting with the lowest-risk pilot
- finish the product/content backlog tracked in [rizom-site-tbd.md](./plans/rizom-site-tbd.md) without blocking the extraction work

Plans:

- [rizom-site-composition.md](./plans/rizom-site-composition.md)
- [rizom-theme-hardening.md](./plans/rizom-theme-hardening.md)
- [rizom-site-tbd.md](./plans/rizom-site-tbd.md)

### 2. Documentation phase 2

Fill the remaining user-facing docs in parallel with the product work above:

- entity type reference
- content-management guidance
- interface setup guides
- deeper customization docs for themes, layouts, and plugin authoring examples
- keep architecture-level plugin docs thin and point implementation detail to the relevant `AGENTS.md` files and `plugins/examples/`

Plan:

- [documentation.md](./plans/documentation.md)

## Long-term

These areas are intentionally post-`v0.2.0`. They are tracked but not gating launch.

### Public plugin surface

A cleaner external extension story — public subpath exports (`@rizom/brain/plugins`, `/entities`, `/services`, etc.), loading plugins from `brain.yaml`, a plugin API version contract, and at least one reference external plugin.

Plan:

- [external-plugin-api.md](./plans/external-plugin-api.md)

### Public repo cleanup

A separate project from version stability. Archive-and-rename the private repo to `rizom-ai/brains` with gitleaks sweep, orphan-commit staging, and clean-machine smoke tests. Only meaningful after the plugin and docs stories are settled.

Plan:

- [public-release-cleanup.md](./plans/public-release-cleanup.md)

### Further long-horizon plans

Tracked but not sequenced yet:

- hosted rovers, multi-user infra, monetization
- desktop app, chat interface SDK, atproto integration
- local AI runtime (sidecar for embeddings + generation)
- content insights, entity history, topic auto-merge
- memory reduction, parallel eval workers, unify build pipeline
- relay presets, a2a authentication

See `docs/plans/` for individual plan status.

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
