# brains roadmap

Last updated: 2026-05-08

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
- **Documentation phase 3 / docs site** — `entities/doc` package, `/docs` routes, grouped docs navigation, release-driven content sync, and the standalone `rizom-ai/doc-brain` deploy/rebuild path for `docs.rizom.ai` are complete
- **Docs sync script** — `scripts/sync-docs-content.ts` generates `doc/*.md` from `docs/docs-manifest.yaml` into a content checkout; `bun run docs:check` validates manifest and links while model-specific eval fixtures stay curated by their brain packages
- **Shell initialization coordination** — `ShellBootloader` now owns phased startup, plugin `onReady` is backed by real boot ordering, daemons/job processing start after ready hooks, and site presentation metadata no longer lives on the shell facade
- **External plugin API** — `@rizom/brain` exposes curated `/plugins`, `/entities`, `/services`, `/interfaces`, and `/templates` authoring subpaths; `brain.yaml` loads installed plugin packages via keyed `plugins.<id>.package` entries with env-var interpolation; alpha compatibility is governed by `peerDependencies`; separate-repo reference plugins `rizom-ai/brain-plugin-hello` (service/lifecycle) and `rizom-ai/brain-plugin-recipes` (durable entity) prove the path end-to-end
- **Rizom ecosystem section** — entity-backed `entities/rizom-ecosystem` package powers the shared ecosystem section across Rizom site variants (rover, professional, default), with theme-aware headline contrast and shared `@rizom/ui` wordmark/header alignment
- **Professional-site Rizom alignment** — editorial homepage refresh, tightened typography, shared Rizom-aligned section composition, and a `Wordmark` slot generalized in `@rizom/ui`
- **Relay POC scaffolding** — `brains/relay` preset split, brain prompts, eval scaffold, and SWOT eval coverage land alongside the assessment package split
- **Newsletter composite plugin** — `plugins/newsletter` bundles the newsletter entity with the buttondown service plugin so app authors can wire newsletter publishing in one entry
- **Bitwarden-backed secrets** — `brain secrets:push` pushes local env-backed secrets to a conventionally named Bitwarden Secrets Manager project and rewrites `.env.schema` with pinned Varlock references; generated deploy workflows run the current Varlock CLI with only `BWS_ACCESS_TOKEN` in GitHub Actions secrets
- **External plugin smoke testing** — `brain start --startup-check` loads configured plugins, runs `onRegister` and `onReady`, then exits without starting daemons or job workers and without requiring a real AI API key

## Near-term priorities

### 1. Relay POC delivery

The active product track. `brains/relay` is mid-POC: preset split, brain prompts, eval scaffold, and SWOT eval coverage have landed; the remaining scope is shipping a credible team-brain demo on `rizom.foundation` with `preset: core` (private team brain) and validating the capture → synthesize → share → coordinate loop end-to-end before any preset-tier expansion.

Plans:

- [relay-poc-review.md](./plans/relay-poc-review.md) — POC scope, recommended capability matrix, and what stays out of `core`
- [relay-presets.md](./plans/relay-presets.md) — preset philosophy and what's deferred past the POC

### 2. Public-surface tightening

The external plugin API is alpha-ready and usable today, but not frozen. These are small, focused follow-ups to the now-landed plugin authoring surface — meant to land before more external authors adopt it and lock the alpha contract harder.

Plans:

- [public-entity-types-reconciliation.md](./plans/public-entity-types-reconciliation.md) — fix `IEntityService` generic shape and `search` return type on `@rizom/brain/entities`; flag the alpha-phase break in a changeset
- [npm-package-boundaries.md](./plans/npm-package-boundaries.md) — narrow what an official publishable plugin/entity may depend on, distinct from the external-author surface
- [bitwarden-upstream-followup.md](./plans/bitwarden-upstream-followup.md) — varlock masking + provider-shape fixes upstream so the now-shipping Bitwarden flow stays clean

## Long-term

These areas are intentionally post-`v0.2.0`. They are tracked but not gating launch.

### Programmatic brain composition

`brain.ts` custom definitions are a long-term escape hatch for instances that need composition beyond what `brain.yaml` supports — preset spread, inline plugins, custom plugin logic, and conditional capabilities. `brain.yaml` remains the primary path; this should wait until there is a concrete need and the public model/plugin API is stable enough to support it cleanly.

Plan:

- [custom-brain-definitions.md](./plans/custom-brain-definitions.md) — `brain.ts` escape hatch built on the public `@rizom/brain` surface

### Framework consolidation

Independent internal cleanup items — each removes a fragile coupling held together by discipline rather than by the type system or package boundaries. These do not gate the plugin surface: env declarations external plugins make live in their own packages, and deploy scaffolding is unrelated. Pick those up between feature cycles in any order.

Plans:

- [env-schema-canonical.md](./plans/env-schema-canonical.md) — co-locate env declarations next to the consuming service; aggregate via `shellEnvVars()` in `shell/core`; have `brain-cli` consume that single source instead of `bundled-model-env-schemas.ts`.
- [deploy-scaffolding-consolidation.md](./plans/deploy-scaffolding-consolidation.md) — `@brains/deploy-templates` is now the canonical source for shared deploy templates/scripts/env-schema fragments; remaining work is cutting `brain-cli/src/commands/init.ts` from 1400+ lines and keeping `@rizom/ops` fleet-only.
- [core-env-config.md](./plans/core-env-config.md) — move env defaults from core to the app/instance layer.
- [unify-build-pipeline.md](./plans/unify-build-pipeline.md) — collapse the two parallel build pipelines.
- [brain-cli-declaration-bundler-cleanup.md](./plans/brain-cli-declaration-bundler-cleanup.md) — replace the manual allowlist now that the declaration bundler is established.
- [memory-reduction.md](./plans/memory-reduction.md) — registry/lazy-loading optimization phased after profiling.
- [parallel-eval-workers.md](./plans/parallel-eval-workers.md) — subprocess-based multi-model eval parallelization.
- [topic-auto-merge.md](./plans/topic-auto-merge.md) — cleanup around dead schema surface; bring `checkMergeSimilarity` to eval parity.

### Live-deploy follow-ups

Maintenance scope around what's already running in production today.

Plans:

- [user-offboarding-plan.md](./plans/user-offboarding-plan.md) — explicit offboarding workflow for `rover-pilot` fleets.
- [generic-cover-image-orchestration.md](./plans/generic-cover-image-orchestration.md) — `coverImage` API for `system_create` so per-entity cover sourcing stops being one-off.
- [content-remote-bootstrap.md](./plans/content-remote-bootstrap.md) — directory-sync-owned bootstrap for seeded git content remotes.

### Public repo cleanup

A separate project from version stability. Archive-and-rename the private repo to `rizom-ai/brains` with gitleaks sweep, orphan-commit staging, and clean-machine smoke tests. Only meaningful after the external plugin API story is settled.

Plan:

- [public-release-cleanup.md](./plans/public-release-cleanup.md)

### Further long-horizon

Tracked but not sequenced yet. Grouped by theme.

**Hosted product**

- [hosted-rovers.md](./plans/hosted-rovers.md) — Kubernetes platform for hosted rovers
- [hosted-rover-discord.md](./plans/hosted-rover-discord.md) — DM-only + A2A mesh for hosted rovers
- [multi-user.md](./plans/multi-user.md) — user entities + cross-interface identity
- [monetization.md](./plans/monetization.md) — open core + managed hosting

**New surfaces**

- [desktop-app.md](./plans/desktop-app.md) — Electrobun desktop wrapper
- [chat-interface-sdk.md](./plans/chat-interface-sdk.md) — Vercel Chat SDK adapter consolidation
- [atproto-integration.md](./plans/atproto-integration.md) — AT Protocol distribution layer

**Auth / federation**

- [a2a-request-signing.md](./plans/a2a-request-signing.md) — RFC 9421 request signing for inter-rover A2A
- [brain-oauth-provider.md](./plans/brain-oauth-provider.md) — first-party OAuth provider for browser-authored CMS

**CMS evolution**

- [cms-on-core.md](./plans/cms-on-core.md) — admin + CMS surface on core
- [cms-heavy-backend.md](./plans/cms-heavy-backend.md) — backend-heavier CMS once the OAuth provider exists
- [cms-github-oauth.md](./plans/cms-github-oauth.md) — explicitly throwaway bridge until `cms-heavy-backend` ships

**Renderer / HTTP surface**

- [template-renderer-contracts.md](./plans/template-renderer-contracts.md) — renderer-neutral contract extraction
- [astro-renderer-spike.md](./plans/astro-renderer-spike.md) — whether Astro should replace or complement the Preact builder
- [unified-http-surface.md](./plans/unified-http-surface.md) — consolidate MCP/A2A/webserver HTTP surface

**Local AI**

- [embedding-service.md](./plans/embedding-service.md) — local AI runtime sidecar (embeddings + generation)

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

- **`rover`** — the public reference model (personal brain)
- **`ranger`** — internal-use source model for `rizom-ai`
- **`relay`** — internal-use source model for `rizom-foundation`, currently in POC with brain prompts, preset split, and SWOT eval coverage

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
