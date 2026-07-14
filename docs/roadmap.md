# brains roadmap

Last updated: 2026-07-14

This roadmap is the public-facing view of where `brains` is headed.

It focuses on product direction and release readiness, not internal task-by-task tracking. For implementation detail, see the linked plan docs in `docs/plans/`.

## Current status

`brains` is approaching its first stable `v0.2.0` release. `@rizom/brain` and the public Rizom site/tooling packages publish through Changesets; `0.2.0-alpha.157` is live on `yeehaa.io`, the full hosted Rover pilot fleet, and the `new.rizom.ai` package-path canary. The production Rizom and docs sites still run on their existing standalone deployment paths until the consolidated-site rollout is ready. "Launch" means graduating the current alpha contract to stable `v0.2.0`, not a repo-rename ceremony.

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

`v0.2.0` is a packaging and stability milestone, not a feature gate against any one posture. The release candidate is ready when:

- the runtime APIs surfaced through `@rizom/brain/{plugins,entities,services,interfaces,templates}` have an explicit compatibility sign-off;
- the `public` / `shared` / `restricted` visibility model is accepted as the baseline contract;
- personal-publishing eval coverage, packed external-plugin smokes, and package-boundary checks are green on one nominated alpha;
- documented init and deploy flows reconcile against standalone and hosted Rover paths;
- the console dynamic-state tail is merged and its changeset released;
- that alpha is healthy on the hosted Rover canaries and `yeehaa.io` before Changesets exits prerelease mode.

Then publish stable `0.2.0`, deploy canaries first, and roll through the fleet. Collective-posture validation (§2), multi-user completion (§3), brain-model unification (§1), and Rizom consolidation (§4) do **not** gate stable `v0.2.0`.

### Current execution focus

Priority is explicit; an existing worktree does not automatically outrank release work.

| Priority | Outcome                            | Current execution                                                                                                                                                                                                           |
| -------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0**   | Stable `v0.2.0` release candidate  | The console dynamic-state/composer tail is closed and released; nominate the final alpha, run the release-candidate gates above, then exit prerelease mode.                                                                 |
| **P1**   | Real runtime identity boundary     | Finish `feature/auth-runtime-db` as one database-backed source of truth with transactional role invariants and deny-by-default identity resolution; multi-user behavior follows on that foundation.                         |
| **P1**   | One brain composed from bundles    | Start the capability-bundle walking skeleton after the release candidate is cut; keep every deployed posture green through the migration.                                                                                   |
| **P1**   | One production Rizom brain/site    | Finish the in-flight consolidated site and content work, stage the consolidated package on `new.rizom.ai`, then cut over production. This may proceed beside bundle work but must not invent a competing model abstraction. |
| **P2**   | Opportunity-prioritization dogfood | Finish and merge the in-flight capture/ranking/focus slice without adding it to a default bundle. Recurring stale alerts wait for the [shared scheduler/heartbeat plan](./plans/shared-heartbeat-recurring-checks.md).      |

Everything marked parked or exploratory below is demand-gated. New work should not preempt P0/P1 without an explicit roadmap change.

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

- [identity-and-trust.md](./plans/identity-and-trust.md) — the positioning doc for this section: three subject kinds (humans, brains, external clients), the channels they arrive on, and the settled cross-cutting decisions (domain-as-brain-identity, key custody, agent-directory trust establishment) the plans below execute against.
- [multi-user.md](./plans/multi-user.md) — runtime users, roles, active-user checks, attribution, and management surfaces.
- [auth-runtime-db.md](./plans/auth-runtime-db.md) — **active on `feature/auth-runtime-db`**: auth-specific runtime database for users, passkeys, OAuth/session stores, identity bindings, and audit; storage cutover and permission invariants remain before merge.
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
- [rizom-sites-on-hosted-rover.md](./plans/rizom-sites-on-hosted-rover.md) — **rollout tail**: npm-resolvable site packages, hash-tagged fleet images, and per-domain TLS/DNS are implemented and released; `new.rizom.ai` proves the hosted package path. Remaining work is the production Rizom/docs cutover and legacy deployment retirement.
- [rizom-consolidation.md](./plans/rizom-consolidation.md) — **in progress on `work/rizom-consolidated-site`**: the consolidated routes, Rover composition, merged content repo, and published-site-model port exist in the worktree. Remaining work is copy/schema completion, merge/release, a real consolidated staging deploy, runtime-state migration, production cutover, and retirement.
- [rover-onboarding-plugin.md](./plans/rover-onboarding-plugin.md) — extract Rover onboarding playbooks into a first-party service plugin that owns bundled content and lifecycle wiring.
- [user-offboarding-plan.md](./plans/user-offboarding-plan.md) — explicit rover-pilot offboarding workflow.
- [discord-opt-in-plan.md](./plans/discord-opt-in-plan.md) — make Discord opt-in in `@rizom/ops` rover-pilot scaffolding, so new pilot users start with Discord disabled unless the operator requests it.

### 5. Interfaces

The chat and editing surfaces brains speak through, kept transport-neutral so Discord, Slack, web-chat, and the CMS share semantics instead of each reinventing them. Discord and the bundled web chat ship today; this section is the consolidation and expansion work.

Plans:

- [slack-chat-sdk.md](./plans/slack-chat-sdk.md) — first Slack slice for `@brains/chat`, building on the shared `MessageInterface` helpers already extracted from Discord/web-chat workflows.
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
- [agent-proximity-map.md](./plans/agent-proximity-map.md) — **P2, not started**: radial embedding-distance map of discovered agents around the brain, with labeled semantic clusters; ships as a console dashboard widget and a public site template, plus the read-only `getEmbeddings` core API it needs.
- [bd-priority-engine.md](./plans/bd-priority-engine.md) — **in progress on `feat/opportunity-priority-engine`**: capture, deterministic ranking, focus/state suggestions, and the first dashboard slice exist in the worktree. Composition and eval hardening remain; recurring alerts are blocked on a shared scheduler/heartbeat primitive and stay outside the entity package.

### 7. Keep the framework sustainable

These are real, but they should not masquerade as product bets. They reduce drag so product work stays possible. Split here between cleanup that is scheduled when it reduces real drag, and research probes kept as parked thinking until something forces them up the queue.

Cleanup:

- [parallel-eval-workers.md](./plans/parallel-eval-workers.md) — parallelize multi-model eval runs.
- [plugin-contracts-consolidation.md](./plans/plugin-contracts-consolidation.md) — collapse redundant runtime/public mappers via `Schema.parse`.
- [shared-heartbeat-recurring-checks.md](./plans/shared-heartbeat-recurring-checks.md) — **P2 dependency** for recurring plugin checks: reuse the existing scheduler/daemon/runtime-state/notification primitives rather than shipping opportunity-specific timers.

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
