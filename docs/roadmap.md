# brains roadmap

Last updated: 2026-05-29

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

### What stable `v0.2.0` means

`v0.2.0` is a packaging and stability milestone, not a feature gate against Relay validation. It ships when:

- the runtime APIs surfaced through `@rizom/brain/{plugins,entities,services,interfaces,templates}` are treated as the supported authoring surface;
- the `public` / `shared` / `restricted` visibility model is considered the baseline contract;
- Rover eval coverage stays green across alpha releases;
- documented deploy and init flows continue to reconcile against the extracted production paths.

Relay POC validation (§2) and shared-Relay trust hardening (§3) proceed in parallel and do **not** gate `v0.2.0`.

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
- **External plugin API** — `@rizom/brain` exposes curated `/plugins`, `/entities`, `/services`, `/interfaces`, and `/templates` authoring subpaths; `brain.yaml` loads installed plugin packages via keyed `plugins.<id>.package` entries with env-var interpolation; alpha compatibility is governed by `peerDependencies`; separate-repo reference plugins `rizom-ai/brain-plugin-hello` (service/lifecycle) and `rizom-ai/brain-plugin-recipes` (durable entity) prove the path end-to-end; public entity-service types now use the canonical runtime contracts for `IEntityService`, `IEntitiesNamespace`, `ListOptions`, `SearchOptions`, and `SearchResult`; declaration bundling now has an explicit documented inline allowlist, clearer internal-import diagnostics, and focused tests
- **Rizom ecosystem section** — entity-backed `entities/rizom-ecosystem` package powers the shared ecosystem section across Rizom site variants (rover, professional, default), with theme-aware headline contrast and shared `@rizom/ui` wordmark/header alignment
- **Professional-site Rizom alignment** — editorial homepage refresh, tightened typography, shared Rizom-aligned section composition, and a `Wordmark` slot generalized in `@rizom/ui`
- **Relay POC scaffolding** — `brains/relay` preset split, brain prompts, eval scaffold, and SWOT eval coverage land alongside the assessment package split
- **Newsletter composite plugin** — `plugins/newsletter` bundles the newsletter entity with the buttondown service plugin so app authors can wire newsletter publishing in one entry
- **Bitwarden-backed secrets** — `brain secrets:push` pushes local env-backed secrets to a conventionally named Bitwarden Secrets Manager project and rewrites `.env.schema` with pinned Varlock references; generated deploy workflows run the current Varlock CLI with only `BWS_ACCESS_TOKEN` in GitHub Actions secrets
- **External plugin smoke testing** — `brain start --startup-check` loads configured plugins, runs `onRegister` and `onReady`, then exits without starting daemons or job workers and without requiring a real AI API key
- **Entity visibility foundation** — entities now carry normalized `public` / `shared` / `restricted` visibility, persisted as top-level runtime state and enforced across read/search/list/update surfaces so public/trusted/anchor contexts fail closed by default
- **Shared-space trust first slice** — configured `spaces` can grant collaborator/trusted access through centralized permission resolution, with exact/wildcard selectors, Discord channel context, bot/guest exclusion, and anchor non-escalation covered by tests
- **Local auth issuer defaults** — local development auth now prefers the running localhost origin while preserving explicit and production issuer behavior
- **Dashboard entry point** — the dashboard now uses permission-aware widgets/endpoints/interactions, renders first-class “ways to connect,” and has mobile ordering that leads with identity and interaction affordances before corpus metrics
- **Preview-domain alignment** — standalone deploy scaffolding and shared preview-domain derivation now use `preview.<brain-domain>` consistently for apex and nested brain domains
- **PDF carousel and LinkedIn document publishing** — deck-owned carousel rendering now produces Playwright-backed PDF attachments with opaque LinkedIn-safe backgrounds; operators can preview generated attachments, save durable PDF `document` entities, attach them to `social-post.documents[]`, and publish native LinkedIn document/carousel posts through the current `/rest/documents` + `/rest/posts` flow
- **Queued entity stubs** — prompt-based `system_create` now persists an addressable stub with `status: generating` and returns its id immediately, so multi-turn follow-ups (e.g. "now generate a cover image for that post") can reference the entity before the generation job completes; stubs are excluded from semantic search by default and the base generation handler updates the stub in place on completion or marks it `failed` on error
- **Publish action policy** — entity write/publish actions are enforced through the centralized permission policy layer, with collaborator mutations constrained by entity type and action and Rover eval coverage for blog/newsletter publish flows
- **Structured chat confirmations** — pending actions carry explicit approval ids and structured summary/preview cards; chat surfaces (web-chat, chat-repl, Discord) render approval cards natively and route confirmation responses through the chat transport, removing the singular-approval fallback path
- **Web chat session management** — the bundled `/chat` surface now supports session list/switch/new, rename, archive, and explicit delete on top of the MVP, with browser-storage memory of the last selected conversation
- **Web chat outbound attachments** — generated documents stream through the web-chat transport as AI SDK UI data parts, so saved PDF/document artifacts render inline in the chat surface with download affordances

## Strategic roadmap

The central product bet is now explicit:

> **Rover remains a standalone personal/professional brain. Relay proves the team/collective brain: one shared Relay per team or collective, not one bot per person.**

The roadmap is organized around that story rather than generic short/medium/long buckets. Implementation plans remain in [docs/plans](./plans/README.md), but the roadmap should answer what story the work supports.

### 1. Keep Rover sharp as the public reference

Rover is the public reference brain and should keep working without Relay. The posture has shifted from "maintain Rover" to "actively harden Rover alongside the Relay POC" — both produce signal worth acting on, and both feed the same weekly review cadence.

Three parallel sub-tracks:

**Primary: bundled web chat UI.** Rover (and every brain) currently has no in-browser way to actually chat with the brain — the options are CLI, Discord setup, or MCP through a desktop assistant. None of these is a credible "try it" path for new users. A bundled web chat surface closes that gap and is the most leveraged Rover hardening investment. See [brain-web-ui.md](./plans/brain-web-ui.md).

**Planned: media/OG follow-through.** PDF carousels, LinkedIn document publishing, and durable media artifacts landed in this cycle. Remaining work is the OG image substrate and a unified media generation lifecycle. Cap this at a defined slice — media work has its own gravity and will pull attention from friction work if unchecked.

**Reactive: user-testing friction.** Real users on `yeehaa.io`, `mylittlephoney.com`, and the Rizom variants surface friction the Relay POC won't. Operating model:

- one capture channel (Discord, issues, wherever) so reported friction does not get lost in scattered conversations;
- prioritize by frequency × severity, not by what looks interesting to fix;
- bias toward small ships that propagate via the next deploy rather than coordinated rollouts;
- give setup/first-run friction disproportionate weight — current users are past the onboarding wall, so it is invisible from inside the project but lethal for anyone new;
- keep the friction queue visible somewhere durable so the same papercut does not get re-reported and re-deferred silently.

Both tracks share the same weekly review with Relay POC observations: what hit us this week, what is the smallest fix, what gets shipped.

Supporting plans:

- [brain-web-ui.md](./plans/brain-web-ui.md) — bundled in-browser chat surface for every brain; closes the "how does a new user try Rover" gap.
- [og-images-pdf-carousels.md](./plans/og-images-pdf-carousels.md) — extend the media rendering substrate to generated OG images.

### 2. Prove shared Relay as team knowledge infrastructure

This is the active product story. Relay should behave like one shared team/collective brain in the places where collaboration already happens, starting with Discord/shared spaces.

The proof is not “many personal bots in one room.” The proof is one Relay that can:

- listen in configured shared spaces;
- preserve who said what without collapsing everyone into one anonymous source;
- turn conversation into summaries, decisions, and action items;
- retrieve team memory in context;
- help a collective become more legible to itself.

Current state:

- Relay POC scaffolding exists: presets, prompts, eval scaffold, and assessment coverage.
- Conversation-memory has scoped projection, summaries, decisions, action items, dashboard widgets, and retrieval.
- Shared-space trust first slice is implemented: configured spaces can grant collaborator/trusted access, with Discord channel context and bot/guest exclusions.
- Speaker attribution first pass is implemented; deeper identity-link management remains deferred.

The POC validates when:

- at least one team or collective runs Relay against a real shared space for a sustained cycle (weeks, not days);
- conversation summaries, decisions, and action items are referenced back by participants as the canonical record;
- the rough edges in trust and identity are visible enough to drive §3 prioritization rather than blocking adoption.

Until then, Relay remains an internal experiment owned by `rizom-foundation`.

Plans:

- [relay-presets.md](./plans/relay-presets.md) — Relay preset philosophy, current POC readiness, and deferred scope.
- [conversation-speaker-attribution.md](./plans/conversation-speaker-attribution.md) — implemented attribution first pass; identity-link follow-ups remain.

### 3. Make shared Relay trustworthy enough to matter

If Relay is a shared team brain, trust and identity cannot stay hand-wavy. The system needs enough identity, permissions, and provenance to support real collaboration without prematurely becoming a full SaaS account system.

This includes:

- collaborator trust from configured shared spaces;
- speaker attribution and eventually identity linking;
- runtime users and roles when the shared model needs them;
- auth/runtime storage that is not git-synced content;
- trusted inter-brain/agent collaboration through signed A2A.

Plans:

- [multi-user.md](./plans/multi-user.md) — runtime users, roles, active-user checks, attribution, and management surfaces.
- [auth-runtime-db.md](./plans/auth-runtime-db.md) — auth-specific runtime database for users, passkeys, OAuth/session stores, and audit.
- [operator-runtime-db.md](./plans/operator-runtime-db.md) — broader private runtime-state boundary.
- [a2a-request-signing.md](./plans/a2a-request-signing.md) — RFC 9421 request signing for inter-rover A2A.

### 4. Make shared Relay operable

A shared team brain has to be installable, maintainable, and recoverable by operators. This is not just “hosting later”; it is the operational layer that makes the Relay story viable if the POC works.

Parts of §4 (passkey onboarding, hosted Rover control, CMS auth) depend on the runtime user model from §3 and cannot land before it. Discord UX and dashboard polish can proceed independently.

This includes:

- passkey/operator onboarding;
- safe offboarding and destructive cleanup for pilot fleets;
- hosted/fleet deploy shape;
- Discord UX for shared team contexts;
- dashboard/CMS/admin flows for non-developer operation.

Plans:

- [passkey-operator-onboarding.md](./plans/passkey-operator-onboarding.md) — first-passkey setup exists; notification bridge and Discord delivery remain.
- [user-offboarding-plan.md](./plans/user-offboarding-plan.md) — explicit rover-pilot offboarding workflow.
- [rover-default-batch-onboarding.md](./plans/rover-default-batch-onboarding.md) — next hosted Rover pilot customization/preflight work.
- [hosted-rovers.md](./plans/hosted-rovers.md) — hosted rover control plane direction.
- [cms-github-app-hosted.md](./plans/cms-github-app-hosted.md) — hosted-product CMS login via short-lived GitHub App installation tokens (the local GitHub OAuth / passkey-gated PAT methods already shipped in `plugins/cms`).
- [chat-interface-sdk.md](./plans/chat-interface-sdk.md) — parked; revisits multi-platform chat adapter consolidation only when a new platform is prioritized.

### 5. Make the ecosystem credible

The team-brain story needs a credible public ecosystem: docs, plugin surfaces, distribution, and artifacts that make the work legible outside the repo.

This includes:

- public package boundaries for official plugins/entities;
- stable-enough authoring surfaces;
- docs that match the current runtime;
- publishing/media outputs that demonstrate the system publicly;
- future distribution/discovery layers where they support the story.

Plans:

- [npm-package-boundaries.md](./plans/npm-package-boundaries.md) — narrow official publishable plugin/entity dependencies; the utils grab-bag has been broken up (ops, contracts, content-formatters, image, ui-library, site-composition) so remaining work is curation of public surfaces and one official plugin proof.
- [custom-brain-definitions.md](./plans/custom-brain-definitions.md) — parked programmatic composition escape hatch.
- [atproto-integration.md](./plans/atproto-integration.md) — active prototype for distribution/discovery; Phase 1/2 outbound publishing and Phase 2.6 registry contracts are implemented, with live `rizom.ai` registry enablement still pending.
- [desktop-app.md](./plans/desktop-app.md) — parked Electrobun-based native-app direction.

### 6. Keep the framework sustainable

These are real, but they should not masquerade as product bets. They reduce drag so product work stays possible. Split here between cleanup that is scheduled when it reduces real drag, and research probes kept as parked thinking until something forces them up the queue.

Cleanup:

- [env-handling.md](./plans/env-handling.md) — co-locate env declarations and move `process.env` reads out of `shell/core` into the app/deploy layer.
- [unify-build-pipeline.md](./plans/unify-build-pipeline.md) — collapse duplicated build responsibilities.
- [parallel-eval-workers.md](./plans/parallel-eval-workers.md) — parallelize multi-model eval runs.

Research probes (parked):

- [memory-reduction.md](./plans/memory-reduction.md) — profile first, then optimize registry/template/lazy-loading pressure.
- [template-renderer-contracts.md](./plans/template-renderer-contracts.md) — renderer-neutral contracts and Astro spike.
- [embedding-service.md](./plans/embedding-service.md) — local AI runtime sidecar direction.

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
