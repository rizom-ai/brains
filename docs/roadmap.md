# brains roadmap

Last updated: 2026-04-28

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
- **Standalone authoring** — local `src/site.ts` / `src/theme.css` conventions for models that scaffold site/theme authoring, plus deploy scaffolding through `brain init --deploy`
- **Alpha npm publishing** — `@rizom/brain` is already shipping public alpha releases with automated Changesets-based publishing
- **Library exports Tier 1** — `@rizom/brain/site` and `@rizom/brain/themes`
- **Deployment foundation** — `brain cert:bootstrap`, app-local `.env.schema` generation, init artifact reconciliation, and the first standalone Kamal workflow shape
- **Multi-user fleet operations** — `@rizom/ops` for operator-managed rover fleets: shared wildcard TLS with `<handle>-preview.<zone>` preview routing, age-encrypted per-user secret files, content repo auto-create with anchor profile seeding, Discord anchor support, preview-domain routing aligned across deploy paths
- **Production deploy validation** — `rizom.ai`, `mylittlephoney.com`, and `yeehaa.io` are live on their intended production paths
- **Extracted deploy convergence** — the checked-out external deployments now use the shared HTTP-host shape: `app_port: 8080`, no active in-container `Caddyfile`, and direct `brain start` boot
- **Rizom site core consolidation** — `rizom.ai`, `rizom.foundation`, and `rizom.work` now own their final route composition from app-local `src/site.ts`, over the shared `sites/rizom` core with `shared/theme-rizom` kept separate
- **Monorepo cleanup** — transitional apps/packages removed; `rizom.ai`, `rizom.foundation`, `rizom.work`, `mylittlephoney`, and `yeehaa.io` extracted
- **Agent directory tightening** — outbound A2A calls now resolve only from saved local directory entries; explicit user add/save flows approve that saved agent, discovery/review flows can remain `discovered`, invalid agent-contact requests no longer fall back to wishlist creation, and explicit-save generation jobs are idempotent/coalesced
- **Finalized content preservation** — exact/finalized/approved content now persists directly through `system_create` without being routed through generation, with entity-service markdown creation and Rover eval coverage for decks, posts, newsletters, notes, and social posts
- **Rover eval stabilization** — the full Rover suite is green at 86/86, with agent follow-up fixtures isolated from shared mutable domains and YAML fixture tests reduced to broad integrity checks instead of brittle exact-path assertions
- **Assessment package split** — SWOT moved out of agent discovery into `entities/assessment`, keeping agent discovery as the evidence source and assessment as the interpretation/output boundary
- **Doc entity and docs-site bootstrap** — `entities/doc` package with schema, adapter, plugin, datasource, and componentized list/detail templates; `/docs` and `/docs/:slug` routes with grouped sidebar nav and previous/next links; Relay docs test app validates the path end-to-end against a running docs brain
- **Docs publishing ownership clarified** — release-driven sync from this repo into `rizom-ai/doc-brain-content`, with `rizom-ai/doc-brain` owning the standalone deploy/rebuild of `docs.rizom.ai`; no in-monorepo docs deploy path
- **Docs sync script** — `scripts/sync-docs-content.ts` generates `doc/*.md` from `docs/docs-manifest.yaml` into a content checkout; `bun run docs:check` validates manifest, links, and that the committed Relay docs fixture stays in sync

## Near-term priorities

### 1. Rizom site variant follow-through

The Rizom architecture cleanup is now in place: `sites/rizom` owns the shared site core, each Rizom app owns its final composition from local `src/site.ts`, and `shared/theme-rizom` remains the separate shared theme. The deployable Rizom apps (`rizom.ai`, `rizom.foundation`, and `rizom.work`) now live in separate per-app repos for deploy isolation, while the shared Rizom site/theme/model packages remain in `brains`.

Focus areas:

- keep the shared/core boundary stable: `sites/rizom` for shared site structure, app-local `src/site.ts` for variants, `shared/theme-rizom` for theme
- keep the shared Rizom site/theme layer consumable by app repos without depending on monorepo-only workspace wiring
- keep app repos pinned to published `@rizom/brain` / `@rizom/ui` versions and validate with running-app preview rebuilds
- avoid reintroducing in-monorepo deploy app packages for the extracted Rizom sites
- finish the product/content backlog tracked in [rizom-site-tbd.md](./plans/rizom-site-tbd.md) without blocking the extraction work

Plans:

- [rizom-site-composition.md](./plans/rizom-site-composition.md)
- [rizom-site-tbd.md](./plans/rizom-site-tbd.md)

### 2. Documentation phase 3

Phase 2 user-facing docs are in place:

- [entity type reference](./entity-types-reference.md)
- [content-management guidance](./content-management.md)
- [interface setup guide](./interface-setup.md)
- [customization guide](./customization-guide.md) for themes, layouts, and plugin boundaries

Architecture-level plugin docs stay intentionally thin and point implementation detail to the relevant `AGENTS.md` files and `plugins/examples/`.

The Phase 3 docs site is partially landed: the [docs index](./README.md), [source manifest](./docs-manifest.yaml), and the `entities/doc` package (schema, adapter, plugin, datasource, componentized list/detail templates) are in place, and the Relay docs test app validates list/detail routing.

Remaining Phase 3 work:

- configure production secrets/deploy target for `rizom-ai/doc-brain`
- add `DOCS_CONTENT_SYNC_TOKEN` to `rizom-ai/brains` so releases can push generated docs to `rizom-ai/doc-brain-content`
- auto-generate CLI reference from code and `brain.yaml` schema reference from Zod schemas

Plans:

- [documentation.md](./plans/documentation.md)
- [docs-site.md](./plans/docs-site.md)

### 3. External plugin API

External plugin authors still cannot build and load full plugins against `@rizom/brain`. The published surface today is `./cli`, `./site`, `./themes`, and `./deploy` — none of the plugin/entity/service/interface authoring exports exist, and `brain.yaml` has no `plugins:` field.

Starts with an audit of the abstractions, not with publishing them. The plugin framework has grown organically alongside the entity/service/interface split; freezing whatever shape happens to exist today would force the first real external authors to absorb the breaking changes that an internal review would surface anyway. The audit decides which asymmetries between the three plugin types are intentional, what the minimal lifecycle hook set should be, and what the versioning policy is — then publishing follows mechanically.

Scope after the audit: public subpath exports (`@rizom/brain/plugins`, `/entities`, `/services`, `/interfaces`, `/utils`, `/templates`), `brain.yaml` `plugins:` schema with env-var interpolation, plugin API version constant, and at least one reference external plugin proving the path end-to-end.

Plans:

- [external-plugin-api.md](./plans/external-plugin-api.md) — §0 audit gates §1-§5
- [custom-brain-definitions.md](./plans/custom-brain-definitions.md) — downstream `brain.ts` escape hatch that depends on the public surface

## Long-term

These areas are intentionally post-`v0.2.0`. They are tracked but not gating launch.

### Framework consolidation

Independent internal cleanup items — each removes a fragile coupling held together by discipline rather than by the type system or package boundaries. They don't depend on each other, and none is gating the external plugin API: lifecycle hooks added later are additive (backwards-compatible), env declarations external plugins make live in their own packages, and deploy scaffolding is unrelated to the plugin surface. Pick up between feature cycles in any order.

Plans:

- [shell-init-coordination.md](./plans/shell-init-coordination.md) — split `Shell` into runtime facade + `ShellBootloader`; replace the `sync:initial:completed` race with explicit `onRegister`/`onReady`/`onPostReady` lifecycle phases. Landing this before the public plugin surface is frozen avoids a later additive bump but is not required.
- [env-schema-canonical.md](./plans/env-schema-canonical.md) — co-locate env declarations next to the consuming service; aggregate via `shellEnvVars()` in `shell/core`; have `brain-cli` consume that single source instead of `bundled-model-env-schemas.ts`.
- [deploy-scaffolding-consolidation.md](./plans/deploy-scaffolding-consolidation.md) — extract `@brains/deploy-templates` as the canonical home for Caddyfile/Dockerfile/Kamal/scripts/workflow content; cut `brain-cli/src/commands/init.ts` from 1400+ lines; keep `@rizom/ops` fleet-only.

### Public repo cleanup

A separate project from version stability. Archive-and-rename the private repo to `rizom-ai/brains` with gitleaks sweep, orphan-commit staging, and clean-machine smoke tests. Only meaningful after the plugin and docs stories are settled.

Plan:

- [public-release-cleanup.md](./plans/public-release-cleanup.md)

### Further long-horizon plans

Tracked but not sequenced yet:

- hosted rovers, multi-user infra, monetization
- desktop app, chat interface SDK, atproto integration
- local AI runtime (sidecar for embeddings + generation)
- topic auto-merge cleanup
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
