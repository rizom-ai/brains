# brains roadmap

Last updated: 2026-06-25

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
- the personal-publishing posture as the public reference brain
- Kamal-based self-hosted deploy scaffolding, including app-local deploy artifacts, env-schema generation, and Cloudflare Origin CA bootstrap support
- published-path support for standalone brain authoring

### What stable `v0.2.0` means

`v0.2.0` is a packaging and stability milestone, not a feature gate against any one posture. It ships when:

- the runtime APIs surfaced through `@rizom/brain/{plugins,entities,services,interfaces,templates}` are treated as the supported authoring surface;
- the `public` / `shared` / `restricted` visibility model is considered the baseline contract;
- personal-publishing eval coverage stays green across alpha releases;
- documented deploy and init flows continue to reconcile against the extracted production paths.

Collective-posture validation (§2), the trust/identity frontier (§3), and the brain-model unification (§1) proceed in parallel and do **not** gate `v0.2.0`.

## Recently completed

These areas are effectively landed:

- **Entity and plugin architecture** — unified `EntityPlugin` / `ServicePlugin` / `InterfacePlugin` split
- **System tool surface** — create, update, delete, search, extract, status, and insights consolidated into framework-level tools, with durable writes routed through explicit confirmation
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
- **Rover eval stabilization** — the full Rover suite covers shell quality, tool invocation, multi-turn agent flows, publishing, web chat, confirmations, and plugin behavior across the inheritable preset suites described below; the mainline suite stays green
- **Assistant instruction hardening** — the Rover system prompt now closes a set of identity-disclosure and tool-routing gaps surfaced by eval/regression work: it refuses to reveal the configured anchor/profile identity when answering "am I your anchor?"/"am I {name}?" (answering from permission level only), treats an ambiguous "make one draft" follow-up as a clarification rather than self-picking a published item or firing `system_update`, resolves a source named by title/slug through `system_get` before continuing to `system_create` in the same turn for source-derived artifact saves, and refuses to substitute `system_search` for an unavailable `system_extract` instead of presenting existing topics as newly generated — each guarded by `build-instructions` assertions
- **Inheritable core-preset eval suite** — eval suites are now declarative and preset-aware in `brain.eval.yaml`: `core` runs `preset-core`, `default` extends `core` with `preset-default`, and `full` extends `default` with `preset-full`, so larger gates inherit smaller-preset tags instead of duplicating them. The 136 existing fixtures split 67 / 33 / 36 across the three tiers, a `--preset <name>` runner flag boots the named preset hermetically (atproto, email-resend, and other live-effect plugins stay in `evalDisable`), a committed tool-coverage ledger keeps "exhaustive" measurable (17/17 core tools asserted), and a case-level `permissions:` matrix plus turn-level multi-user context exercise public/trusted/anchor boundaries — including approval-hijack and shared-thread denial cases — in single multi-turn conversations
- **Pending entity ingestion** — async entity creation now persists a durable `pending` placeholder immediately and enriches the same entity to `draft` (or `failed`) when the background job completes, so just-saved items are referenceable before processing finishes. A shared `shell/plugins` ingestion helper preserves entity IDs across the lifecycle; `entities/link` is the first adopter (save two links, immediately summarize both), with media/upload entities to follow
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
- **Queued entity stubs** — after confirmation, prompt-based `system_create` persists an addressable stub with `status: generating` and returns its id immediately, so multi-turn follow-ups (e.g. "now generate a cover image for that post") can reference the entity before the generation job completes; stubs are excluded from semantic search by default and the base generation handler updates the stub in place on completion or marks it `failed` on error
- **Publish action policy** — entity write/publish actions are enforced through the centralized permission policy layer, with collaborator mutations constrained by entity type and action and Rover eval coverage for blog/newsletter publish flows
- **Structured chat confirmations** — pending actions carry explicit approval ids and structured summary/preview cards; chat surfaces (web-chat, chat-repl, Discord) render approval cards natively and route confirmation responses through the chat transport, removing the singular-approval fallback path
- **Web chat session management** — the bundled `/chat` surface now supports session list/switch/new, rename, archive, and explicit delete on top of the MVP, with browser-storage memory of the last selected conversation
- **Web chat outbound attachments** — generated documents stream through the web-chat transport as AI SDK UI data parts, so saved PDF/document artifacts render inline in the chat surface with download affordances
- **Runtime state store service** — `shell/runtime-state` ships a shell-owned, namespaced, typed store for ephemeral operational state (libSQL + Drizzle, shell-owned migrations), wired into `shell/core` service initialization and exposed to plugins via `context.runtimeState`; consumers (chat thread subscriptions, playbook run state, notification/setup-email dedupe) are pending

## Strategic roadmap

The central product bet is now explicit:

> **One brain, composed from capability bundles. What used to be three models (rover, relay, ranger) is a single brain whose posture — from personal publishing to shared team memory — is selected by bundles at deploy time. The bet: one brain that scales from a single person to a collective without switching products.**

This is a deliberate change from the previous "two product tracks" framing. There is one product. **Posture is configuration, not a separate product:** `core` + `publishing` is the personal-publishing setting; `core` + `team` is the collective setting; both are the same brain. So the roadmap is organized as: **§1 the brain and its bundles** (what the product is), **§2 the postures we have proven** (the personal→collective validation arc), and **§3–§7 the shared substrate** every brain runs on — grouped by capability, never attributed to one posture.

The frontier moved with the framing. Once posture is just configuration, the open problem is no longer "prove the team product" — it is **multi-user** (§3), the one thing posture-as-config cannot fake. Implementation plans remain in [docs/plans](./plans/README.md); the roadmap should answer what the work supports.

### 1. The brain and its bundles

The product is one brain, composed from **capability bundles** — named, posture-carrying groups of plugins (plugins + their config defaults + permission posture). A brain is `core` plus whichever bundles its posture needs:

- **`core`** — the posture-independent foundation every brain wants: infra (prompt, directory-sync, auth, notifications, mcp, webserver, a2a, dashboard, cms, email) + universal capture (note, link, topics, image, document, wishlist, decks) + peer discovery (`agents`, `assessment`, atproto discovery).
- **`site`** — a public web presence (site-info, site-builder, site-content, themes, web analytics, OG).
- **`publishing`** — content production and distribution (post/blog, series, content-pipeline, social-media, newsletter, stock-photo, portfolio, outbound atproto).
- **`team`** — shared team memory (conversation-memory `shared`, docs) plus the trusted-collaborator permission posture.

Posture is then `brain.yaml` configuration: personal publishing is `core + site + publishing`; a collective is `core + site + team`; both are the same brain. `site` and `publishing` are independent (publishing can target external channels with no website), and instances tune at the edges with `add`/`remove` rather than configurable bundles.

**The structural bet that makes this true** is collapsing the three model packages into one and introducing the bundle primitive. Until it lands, the three `defineBrain` packages still exist; the work is sequenced as thin vertical slices that keep every posture eval-green.

The personal-publishing posture is the public reference and must stay sharp without the team posture. The operating model for it is reactive: real users on `yeehaa.io`, `mylittlephoney.com`, and the Rizom variants surface friction a POC won't —

- one capture channel so reported friction does not get lost;
- prioritize by frequency × severity, not by what looks interesting to fix;
- bias toward small ships that propagate via the next deploy;
- give setup/first-run friction disproportionate weight — current users are past the onboarding wall, so it is invisible from inside the project but lethal for anyone new;
- keep the friction queue durable so the same papercut is not re-reported and re-deferred silently.

The bundled web chat UI (`/chat` — sessions, confirmations, uploads, progress, attachments, sources, suggested actions) and the media/OG pipeline (PDF carousels, printable PDFs, OG images, publish assets) both landed and are now maintained through normal bug/release work rather than standing plans.

Plans:

- [brain-model-unification.md](./plans/brain-model-unification.md) — **the headline structural work**: collapse rover/relay/ranger into one brain, introduce capability bundles, retire presets in favor of bundles + `brain init` recipes. Supersedes the three-reference-model framing.
- [rover-core-preset-evals.md](./plans/rover-core-preset-evals.md) — preset-aware eval harness merged; remaining work fills behavioral coverage and re-tags toward bundle combinations as unification lands.
- [web-search-tool.md](./plans/web-search-tool.md) — provider-neutral `web_search` capability (Tavily first), permission-gated and audited; Phase 0 removes the verified-dead `webSearch` config flag.
- [system-analytics-tool.md](./plans/system-analytics-tool.md) — rename/reframe `system_insights` as an extensible typed analytics/reporting surface, folding plugin reports such as Cloudflare traffic into one LLM-facing tool.

### 2. The collective posture (active POC)

`core + site + team` is the one posture still being validated — the personal-publishing posture already runs in production (§1). The proof is not "many personal bots in one room"; it is one shared brain that can:

- listen in configured shared spaces;
- preserve who said what without collapsing everyone into one anonymous source;
- turn conversation into summaries, decisions, and action items;
- retrieve team memory in context;
- help a collective become more legible to itself.

Current state of the collective posture:

- the `team` capabilities exist as the POC packaged today (prompts, eval scaffold, assessment coverage);
- conversation-memory has scoped projection, summaries, decisions, action items, dashboard widgets, and retrieval;
- speaker attribution first pass is implemented: messages preserve actor/source metadata and summaries track participants; deeper identity-link management remains deferred to §3;
- the shared-space trust first slice is implemented: configured spaces grant collaborator/trusted access, with Discord channel context and bot/guest exclusions;
- multi-user turn context and permission boundaries are under eval: the core suite replays anchor/trusted/public conversations in one thread and guards approval-hijack and shared-thread write denials.

The collective posture validates when:

- at least one team or collective runs it against a real shared space for a sustained cycle (weeks, not days);
- summaries, decisions, and action items are referenced back by participants as the canonical record;
- the rough edges in trust and identity are visible enough to drive §3 prioritization rather than blocking adoption.

Until then it remains an internal experiment owned by `rizom-foundation`. Note the hard line: the `team` posture ships a _permission posture_ (trusted-collaborator writes), which is collaboration on the single-anchor model — **not** true multi-user. That substrate is §3.

To differentiate as more than "the personal posture minus publishing," the collective posture needs team-native capabilities that don't exist yet — meeting notes, decision records, conversational Q&A over the brain ("ask the team"), and a scheduled team digest — built as dedicated plugins rather than reused publishing stack.

Plans:

- [team-posture-capabilities.md](./plans/team-posture-capabilities.md) — the prioritized roadmap of team-native capabilities that make the collective posture distinctive (parked, demand-gated).

### 3. Trust & identity — the frontier

This is now **the** open problem. Once posture is configuration (§1), the only thing that setting cannot fake is real multi-user: distinct people, each a first-class runtime identity with their own auth, roles, per-user state, and cross-interface identity linking. The `team` posture ships a permission _tier_ (trusted-collaborator) on the single-anchor model; turning that tier into an actual roster of people is the substrate work here.

It carries a genuine architectural puzzle: content is markdown/git-synced and shareable, but user identity and auth **must not** be git-synced — so multi-user needs a second data plane (a runtime DB) beside the content plane. This is **not posture-specific**: every brain runs on the same auth, runtime-user, and signing layer. The bar is enough identity and provenance to support real collaboration without prematurely becoming a full SaaS account system.

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
- [a2a-request-signing.md](./plans/a2a-request-signing.md) — RFC 9421 request signing for inter-brain A2A.

### 4. Hosting & operations

Making brains installable, maintainable, and recoverable by operators: fleet/hosting shape, onboarding, and safe offboarding. Driven today by the **hosted personal-brain pilot** (most plans here are pilot ops), but the same machinery hosts the collective posture later. The multi-user admin surfaces depend on the runtime-user model from §3 and cannot land before it; first-passkey bootstrap, anchor-visible setup URL retrieval, auth-service plugin bridging, and setup-email delivery have already shipped, so operator onboarding is no longer a standing plan.

This includes:

- hosted/fleet deploy shape and control plane;
- per-user pilot customization and preflight;
- safe offboarding and destructive cleanup for pilot fleets;
- dashboard/admin flows for non-developer operation.

Plans:

- [rover-default-batch-onboarding.md](./plans/rover-default-batch-onboarding.md) — next hosted Rover pilot customization/preflight work.
- [rover-onboarding-plugin.md](./plans/rover-onboarding-plugin.md) — extract Rover onboarding playbooks into a first-party service plugin that owns bundled content and lifecycle wiring.
- [user-offboarding-plan.md](./plans/user-offboarding-plan.md) — explicit rover-pilot offboarding workflow.
- [discord-opt-in-plan.md](./plans/discord-opt-in-plan.md) — make Discord opt-in in `@rizom/ops` rover-pilot scaffolding, so new pilot users start with Discord disabled unless the operator requests it.

### 5. Interfaces

The chat and editing surfaces brains speak through, kept transport-neutral so Discord, Slack, web-chat, and the CMS share semantics instead of each reinventing them. Discord and the bundled web chat ship today; this section is the consolidation and expansion work.

Plans:

- [first-party-cms-editor.md](./plans/first-party-cms-editor.md) — first-party React editor that writes through the entity service (entity DB as single writer, git persistence via directory-sync). The committed CMS direction, replacing the Sveltia/GitHub-App token path.
- [slack-chat-sdk.md](./plans/slack-chat-sdk.md) — first Slack slice for `@brains/chat`, separate from Discord replacement work.
- [chat-message-interface-shared-workflows.md](./plans/chat-message-interface-shared-workflows.md) — extraction pass moving Discord/Web-chat-generic workflows into `MessageInterface` helpers before Slack duplicates them.
- [brain-web-chat-sdk-adapter.md](./plans/brain-web-chat-sdk-adapter.md) — parked strategy; how browser web-chat can share Chat SDK semantics with Discord/Slack/etc. without losing Brain-specific web-chat features.
- [chat-interface-forms-modals.md](./plans/chat-interface-forms-modals.md) — parked; transport-neutral structured forms that render as platform-native UI (Discord modals, Slack/Teams forms, web-chat dialogs) once adapter support exists.
- [message-feedback.md](./plans/message-feedback.md) — parked; transport-neutral thumbs-up/down feedback capture from chat interfaces, pending a real feedback sink/use case.

### 6. Ecosystem

A credible public ecosystem: package boundaries, distribution/discovery, interop, and authoring surfaces that make the work legible outside the repo.

This includes:

- public package boundaries for official plugins/entities;
- stable-enough authoring surfaces;
- distribution/discovery and interchange where they support the story.

Plans:

- [npm-package-boundaries.md](./plans/npm-package-boundaries.md) — narrow official publishable plugin/entity dependencies; the utils grab-bag has been broken up (ops, contracts, content-formatters, image, ui-library, site-composition) so remaining work is curation of public surfaces and one official plugin proof.
- [atproto-integration.md](./plans/atproto-integration.md) — active prototype for distribution/discovery; outbound publishing, registry contracts/routes, and the first bounded discovery slice are implemented. Remaining work is OAuth hardening, configurable discovery/Jetstream, and later ingestion/feed work.
- [mcp-external-redesign.md](./plans/mcp-external-redesign.md) — CQRS split for external MCP: raw read tools stay composable (`readOnlyHint`), all mutations route through a single agent-gated `chat` command; `debug` mode keeps raw write tools local-only.
- [bd-priority-engine.md](./plans/bd-priority-engine.md) — Opportunity Priority Engine: proposed standalone `@brains/opportunity` package for conversational opportunity prioritization (value + integrity-gate scoring, Active/Staged/Warm states, heartbeat alerts). Rizom dogfooding Brains for opportunity prioritization; brain-agnostic, not in any default bundle.

### 7. Keep the framework sustainable

These are real, but they should not masquerade as product bets. They reduce drag so product work stays possible. Split here between cleanup that is scheduled when it reduces real drag, and research probes kept as parked thinking until something forces them up the queue.

Cleanup:

- [env-handling.md](./plans/env-handling.md) — co-locate env declarations and move `process.env` reads out of `shell/core` into the app/deploy layer.
- [unify-build-pipeline.md](./plans/unify-build-pipeline.md) — collapse duplicated build responsibilities.
- [parallel-eval-workers.md](./plans/parallel-eval-workers.md) — parallelize multi-model eval runs.
- [external-dependency-review.md](./plans/external-dependency-review.md) — dead-weight removal, safe-drift sweep, tooling majors (eslint 8→10, TS 6), and the zod 3→4 migration that blocks the first stable `@rizom/brain`.
- [plugin-contracts-consolidation.md](./plans/plugin-contracts-consolidation.md) — collapse redundant runtime/public mappers via `Schema.parse`.
- [codebase-cleanup-backlog.md](./plans/codebase-cleanup-backlog.md) — reference backlog of unowned findings from the 2026-06 shell audit (CSS monoliths, `@brains/utils` split, package-script drift).
- [system-create-source-architecture.md](./plans/system-create-source-architecture.md) — agent interpretation boundary: language is data, not control flow. The model interprets NL once into typed tool args; all other branching is on types and policy. Deletes the NL guards (`call-options.ts` regexes, routing prose, source-precedence sniffing) and makes `system_create` source-only at the model boundary. Supersedes the former save-note-source-resolution and agent-instruction-surface plans.
- [upload-attachment-visibility.md](./plans/upload-attachment-visibility.md) — sibling of the interpretation-boundary plan: what attachments the model sees is data and cost policy, never message wording. Deletes the wording-based upload/attachment selection (`selectReferencedAttachments`, `conversation-messages.ts` narrowing helpers) so the model resolves "it/this/latest" against candidate refs instead of code regexes.

Research probes (parked):

- [template-renderer-contracts.md](./plans/template-renderer-contracts.md) — renderer-neutral contracts and Astro spike.
- [embedding-service.md](./plans/embedding-service.md) — local AI runtime sidecar direction.
- [turso-database-engine.md](./plans/turso-database-engine.md) — exploratory: whether the SQLite-from-scratch Rust rewrite unlocks a DB-level/browser sync model that libSQL can't.

## Product direction

The project is intentionally opinionated.

`brains` is being shaped around:

- self-hosted AI knowledge agents
- markdown as durable source of truth
- MCP as the default assistant integration layer
- one brain per instance, composed from capability bundles (posture is configuration, not a separate product)
- strong plugin boundaries instead of ad hoc app code
- site publishing from the same content graph that powers the agent

It is **not** currently targeting:

- multi-tenant SaaS hosting (one instance can serve multiple _users_ — §3 — but not multiple isolated tenants)
- generic autonomous-agent orchestration
- a fully stable plugin SDK before `1.0`

## Reference postures

There is one brain; "reference models" are now bundle combinations, not packages:

- **personal publishing** — `core + site + publishing`; the public reference, live in production (formerly the `rover` model).
- **collective / team** — `core + site + team`; the active POC (formerly the `relay` model).
- **commerce** — `core + site` plus the opt-in `products` capability (absorbs what the `ranger` model carried).

External examples and docs should treat the **personal-publishing** posture as the main reference. The `rover`/`relay`/`ranger` model packages are being retired in [brain-model-unification.md](./plans/brain-model-unification.md).

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
