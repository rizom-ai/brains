# brains roadmap

Last updated: 2026-04-29

This roadmap is the public-facing view of where `brains` is headed.

It focuses on product direction and release readiness, not internal task-by-task tracking. For implementation detail, see the linked plan docs in `docs/plans/`.

## Current status

`brains` is approaching its first stable `v0.2.0` release. The deploy-validation, Rizom site, and docs-site gates have been cleared: `rizom.ai`, `mylittlephoney.com`, and `yeehaa.io` are live on their intended production paths, the extracted deployment repos match the shared HTTP-host shape used by the current scaffold, the Rizom site variants are owned by their standalone app repos over the shared `sites/rizom` core, and `docs.rizom.ai` is owned by the standalone docs brain path. `@rizom/brain` is already publishing public alpha releases via changesets, so "launch" here means the current alpha cycle matures into a stable `v0.2.0` — not a repo-rename ceremony.

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
- **Rizom site follow-through** — `rizom.ai`, `rizom.foundation`, and `rizom.work` own their final route composition from app-local `src/site.ts`, over the shared `sites/rizom` core with `shared/theme-rizom` kept separate; remaining CTA/content polish belongs to the extracted app/content repos, not this monorepo roadmap
- **Monorepo cleanup** — transitional apps/packages removed; `rizom.ai`, `rizom.foundation`, `rizom.work`, `mylittlephoney`, and `yeehaa.io` extracted
- **Agent directory tightening** — outbound A2A calls now resolve only from saved local directory entries; explicit user add/save flows approve that saved agent, discovery/review flows can remain `discovered`, invalid agent-contact requests no longer fall back to wishlist creation, and explicit-save generation jobs are idempotent/coalesced
- **Finalized content preservation** — exact/finalized/approved content now persists directly through `system_create` without being routed through generation, with entity-service markdown creation and Rover eval coverage for decks, posts, newsletters, notes, and social posts
- **Rover eval stabilization** — the full Rover suite covers 86 cases across shell quality, tool invocation, multi-turn agent flows, and plugin behavior; the previous search-argument and ambiguous-agent failures are fixed, with residual full-suite variance tracked in per-run results
- **Assessment package split** — SWOT moved out of agent discovery into `entities/assessment`, keeping agent discovery as the evidence source and assessment as the interpretation/output boundary
- **Documentation phase 3 / docs site** — `entities/doc` package, `/docs` routes, grouped docs navigation, release-driven content sync, Relay docs fixtures, and the standalone `rizom-ai/doc-brain` deploy/rebuild path for `docs.rizom.ai` are complete
- **Docs sync script** — `scripts/sync-docs-content.ts` generates `doc/*.md` from `docs/docs-manifest.yaml` into a content checkout; `bun run docs:check` validates manifest, links, and that the committed Relay docs fixture stays in sync
- **Shell initialization coordination** — `ShellBootloader` now owns phased startup, plugin `onReady` is backed by real boot ordering, daemons/job processing start after ready hooks, and site presentation metadata no longer lives on the shell facade

## Near-term priorities

### 1. External plugin API

External plugin authors can now import the curated authoring surface from `@rizom/brain` and declare installed plugin packages in `brain.yaml` with keyed `plugins.<id>.package` entries. The plugin framework has real `onRegister`/`onReady` semantics: `onRegister` is for capability registration, `onReady` runs after identity/profile and startup coordination are complete, and background daemons/jobs start afterward.

Remaining scope: one reference external plugin proving the path end-to-end, plugin author docs that match the public surface, and any follow-up CLI ergonomics if they materially improve installation/configuration. During alpha, compatibility uses normal package-manager `peerDependencies`; runtime `rizomBrain.pluginApi` checks are deferred until the plugin API version diverges from the package version.

Plans:

- [shell-init-coordination.md](./plans/shell-init-coordination.md) — completed lifecycle foundation before public plugin exports
- [external-plugin-api.md](./plans/external-plugin-api.md) — remaining reference plugin and authoring docs work
- [custom-brain-definitions.md](./plans/custom-brain-definitions.md) — downstream `brain.ts` escape hatch that depends on the public surface

## Long-term

These areas are intentionally post-`v0.2.0`. They are tracked but not gating launch.

### Framework consolidation

Independent internal cleanup items — each removes a fragile coupling held together by discipline rather than by the type system or package boundaries. These do not gate the plugin surface: env declarations external plugins make live in their own packages, and deploy scaffolding is unrelated. Pick those up between feature cycles in any order.

Plans:

- [env-schema-canonical.md](./plans/env-schema-canonical.md) — co-locate env declarations next to the consuming service; aggregate via `shellEnvVars()` in `shell/core`; have `brain-cli` consume that single source instead of `bundled-model-env-schemas.ts`.
- [deploy-scaffolding-consolidation.md](./plans/deploy-scaffolding-consolidation.md) — extract `@brains/deploy-templates` as the canonical home for Caddyfile/Dockerfile/Kamal/scripts/workflow content; cut `brain-cli/src/commands/init.ts` from 1400+ lines; keep `@rizom/ops` fleet-only.

### Public repo cleanup

A separate project from version stability. Archive-and-rename the private repo to `rizom-ai/brains` with gitleaks sweep, orphan-commit staging, and clean-machine smoke tests. Only meaningful after the external plugin API story is settled.

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
