# brains roadmap

Last updated: 2026-04-15

This roadmap is the public-facing view of where `brains` is headed.

It focuses on product direction and release readiness, not internal task-by-task tracking. For implementation detail, see the linked plan docs in `docs/plans/`.

## Current status

`brains` is approaching its first stable `v0.2.0` release. The deploy-validation gate has been cleared: `rizom.ai`, `mylittlephoney.com`, and `yeehaa.io` are live on their intended production paths. `@rizom/brain` is already publishing public alpha releases via changesets, so "launch" here means the current alpha cycle matures into a stable `v0.2.0` — not a repo-rename ceremony.

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
- **Rizom site variant split** — `rizom.ai`, `rizom.foundation`, and `rizom.work` each own their final route composition and section templates via thin wrapper packages over a shared base
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

### 2. Rizom site variant follow-through

The variant split across `rizom.ai`, `rizom.foundation`, and `rizom.work` landed — each app now owns its final composition. Remaining work is product polish and eventual extraction.

Focus areas:

- finish the product/content backlog tracked in [rizom-site-tbd.md](./plans/rizom-site-tbd.md) (CTA destinations, newsletter/support links, quiz URLs)
- decide which currently shared section implementations are truly reusable primitives versus app-specific sections
- extract each app into a standalone repo once its composition is stable

Plans:

- [rizom-site-composition.md](./plans/rizom-site-composition.md)
- [rizom-site-tbd.md](./plans/rizom-site-tbd.md)

### 3. Documentation phase 2

Fill the remaining user-facing docs in parallel with the product work above:

- entity type reference
- content-management guidance
- interface setup guides
- deeper customization docs for themes, layouts, and plugins

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
