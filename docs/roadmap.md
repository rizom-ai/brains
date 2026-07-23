# brains roadmap

Last updated: 2026-07-20

This roadmap is the public-facing view of where `brains` is headed.

It focuses on product direction and release readiness, not internal task-by-task tracking. For implementation detail, see the linked plan docs in `docs/plans/`.

## Current status

`brains` is approaching its first stable `v0.2.0` release. `@rizom/brain@0.2.0-alpha.204` is published and healthy on the hosted `jo` and `smoke` canaries. The consolidated Rover deployment now serves production `rizom.ai` at alpha.204; `new.rizom.ai` has been retired. The remaining structural release gate is replacing the three-model/preset authoring contract with one canonical brain composed from explicit capability bundles. "Launch" means validating that unified contract and graduating it to stable `v0.2.0`, not a repo-rename ceremony.

What already exists today:

- an alpha-published Bun-based CLI and runtime via `@rizom/brain`
- markdown-backed entities with typed frontmatter
- MCP-native tools and resources
- built-in webserver, A2A, Discord/Slack chat, web chat, and chat REPL interfaces
- static-site generation with reusable site + theme packages
- the personal-publishing posture as the public reference brain
- Kamal-based self-hosted deploy scaffolding, including app-local deploy artifacts, env-schema generation, and Cloudflare Origin CA bootstrap support
- published-path support for standalone brain authoring
- lifecycle-owned shell, daemon, plugin, job, conversation, Discord, and site-rebuild teardown with joinable Promise transitions

### What stable `v0.2.0` means

`v0.2.0` is a packaging and stability milestone, not a feature gate against any one posture. It should not, however, certify model/preset contracts already scheduled for deletion. The release candidate is ready when:

- the canonical `@rizom/brain` definition and `core` / `site` / `publishing` / `team` bundle resolver have replaced the built-in Rover/Relay/Ranger model registry and runtime presets;
- checked-in standalone apps and hosted pilot desired state use explicit bundles, and a second reconcile produces no generated drift;
- the runtime APIs surfaced through `@rizom/brain/{plugins,entities,services,interfaces,templates}` have an explicit compatibility sign-off;
- the `public` / `shared` / `restricted` visibility model is accepted as the baseline contract;
- personal-publishing and team-posture eval coverage, packed external-plugin smokes, and package-boundary checks are green on one nominated unified alpha;
- documented init and deploy flows reconcile against standalone and hosted paths;
- that alpha is healthy on the hosted canaries and `yeehaa.io` before Changesets exits prerelease mode.

Then publish stable `0.2.0`, deploy canaries first, and roll through the fleet. Collective-posture field validation (§2), multi-user completion (§3), and optional capabilities do **not** gate stable `v0.2.0`; brain-model unification (§1) now does.

### Current execution focus

Priority is explicit; an existing worktree does not automatically outrank release work.

| Priority | Outcome                            | Current execution                                                                                                                                                                                                                |
| -------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0**   | One brain composed from bundles    | Implement the refreshed unification plan on the alpha line, migrate standalone and hosted configuration, and keep every supported posture green before deleting model/preset compatibility.                                      |
| **P0**   | Stable `v0.2.0` release candidate  | Publish and deploy a unified alpha, complete the release-candidate gates above, then exit prerelease mode.                                                                                                                       |
| **P1**   | Real runtime identity boundary     | Finish final hardening on `feature/auth-runtime-db`; the database cutover, People admin surface, role invariants, and P0 security findings are implemented, while compatibility gates and lower-priority review findings remain. |
| **P1**   | Finish Rizom consolidation tail    | Production cutover, redirects, and staging retirement are complete; retire old Work/Foundation origins, archive superseded repos, and remove obsolete deployment paths after the rollback window.                                |
| **P2**   | Opportunity-prioritization dogfood | Finish and merge the in-flight capture/ranking/focus slice without adding it to a default bundle. Recurring stale alerts adopt the shared recurring-check service once that slice merges.                                        |

Everything marked parked or exploratory below is demand-gated. New work should not preempt P0/P1 without an explicit roadmap change.

## Strategic roadmap

The central product bet is now explicit:

> **One brain, composed from capability bundles. What used to be three models (rover, relay, ranger) is a single brain whose posture — from personal publishing to shared team memory — is selected by bundles at deploy time. The bet: one brain that scales from a single person to a collective without switching products.**

This is a deliberate change from the previous "two product tracks" framing. There is one product. **Posture is configuration, not a separate product:** `core` + `site` + `publishing` is the personal-publishing setting; `core` + `site` + `team` is the collective setting; both are the same brain. So the roadmap is organized as: **§1 the brain and its bundles** (what the product is), **§2 the postures we have proven** (the personal→collective validation arc), and **§3–§7 the shared substrate** every brain runs on — grouped by capability, never attributed to one posture.

The frontier moved with the framing. Once posture is just configuration, the open problem is no longer "prove the team product" — it is **multi-user** (§3), the one thing posture-as-config cannot fake. Implementation plans remain in [docs/plans](./plans/README.md); the roadmap should answer what the work supports.

### 1. The brain and its bundles

The product is one brain, composed from **capability bundles** — named, posture-carrying groups of plugins (plugins + their config defaults + permission posture). A brain is `core` plus whichever bundles its posture needs:

- **`core`** — posture-independent infrastructure, universal capture, profile/playbook/onboarding workflows, one dashboard capability, MCP/webserver/web-chat/Discord/A2A, and peer discovery including the ATProto registry.
- **`site`** — site-info, site-content, site-builder, analytics, and the dashboard route override used when the site owns `/`; site package and theme remain instance choices.
- **`publishing`** — blog/post, series, portfolio, content-pipeline, social-media, newsletter, stock-photo, outbound ATProto, and publishing instruction/config defaults.
- **`team`** — conversation-memory `shared`, docs, team topic/instruction defaults, and member-scoped trusted collaborator permissions.

Posture is then explicit `brain.yaml` configuration: personal publishing is `core + site + publishing`; a collective is `core + site + team`; commerce is `core + site` plus `products`. `site` and `publishing` are independent (publishing can target external channels with no website), and instances tune at the edges with visible `add`/`remove` plus plugin config rather than configurable bundles. `brain init` recipes expand to this explicit configuration and have no runtime meaning.

**The structural bet that makes this true** is collapsing the three model packages into one and introducing the bundle primitive. Until it lands, the three `defineBrain` packages still exist; the work is sequenced as thin vertical slices that keep every posture eval-green.

The personal-publishing posture is the public reference and must stay sharp without the team posture. The operating model for it is reactive: real users on `yeehaa.io`, `mylittlephoney.com`, and the Rizom variants surface friction a POC won't —

- one capture channel so reported friction does not get lost;
- prioritize by frequency × severity, not by what looks interesting to fix;
- bias toward small ships that propagate via the next deploy;
- give setup/first-run friction disproportionate weight — current users are past the onboarding wall, so it is invisible from inside the project but lethal for anyone new;
- keep the friction queue durable so the same papercut is not re-reported and re-deferred silently.

The bundled web chat UI (`/chat` — sessions, confirmations, uploads, progress, attachments, sources, suggested actions) and the media/OG pipeline (PDF carousels, printable PDFs, OG images, publish assets) both landed and are now maintained through normal bug/release work rather than standing plans. Media rendering now owns each browser through scoped, cancellable acquisition and bounded process cleanup behind its existing Promise API.

Plans:

- [brain-model-unification.md](./plans/brain-model-unification.md) — **the headline structural work**: collapse rover/relay/ranger into one brain, introduce capability bundles, retire presets in favor of bundles + `brain init` recipes. Supersedes the three-reference-model framing.
- [web-search-tool.md](./plans/web-search-tool.md) — provider-neutral `web_search` capability (Tavily first), permission-gated and audited; Phase 0 removes the verified-dead `webSearch` config flag.
- [system-analytics-tool.md](./plans/system-analytics-tool.md) — rename/reframe `system_insights` as an extensible typed analytics/reporting surface, folding plugin reports such as Cloudflare traffic into one LLM-facing tool.
- [topics-derivation.md](./plans/topics-derivation.md) — derived topic entities behind the knowledge map: extraction, reconciliation, projection, and corpus calibration are shipped; the live-fleet rebuild/verification tail remains.

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
- multi-user turn context and permission boundaries are under eval: the core suite replays admin/trusted/public conversations in one thread and guards approval-hijack and shared-thread write denials.

The collective posture validates when:

- at least one team or collective runs it against a real shared space for a sustained cycle (weeks, not days);
- summaries, decisions, and action items are referenced back by participants as the canonical record;
- the rough edges in trust and identity are visible enough to drive §3 prioritization rather than blocking adoption.

Until then it remains an internal experiment owned by `rizom-foundation`. The runtime now provides true multi-user identities and Admin/Anchor separation; the remaining validation is sustained team use of that substrate, not a missing authorization model.

To differentiate as more than "the personal posture minus publishing," the collective posture needs team-native capabilities that don't exist yet — meeting notes, decision records, conversational Q&A over the brain ("ask the team"), and a scheduled team digest — built as dedicated plugins rather than reused publishing stack.

Plans:

- [team-posture-capabilities.md](./plans/team-posture-capabilities.md) — the prioritized roadmap of team-native capabilities that make the collective posture distinctive (parked, demand-gated).

### 3. Trust & identity — the frontier

The runtime substrate is implemented: distinct people have private auth users, roles, per-user state, canonical attribution, and cross-interface identity links. Admin permission and Anchor ownership are independent facets. The frontier now moves to real-world trust calibration, profile-on-subjects, and sustained collective-brain validation.

It carries a genuine architectural puzzle: content is markdown/git-synced and shareable, but user identity and auth **must not** be git-synced — so multi-user needs a second data plane (a runtime DB) beside the content plane. This is **not posture-specific**: every brain runs on the same auth, runtime-user, and signing layer. The bar is enough identity and provenance to support real collaboration without prematurely becoming a full SaaS account system.

This includes:

- collaborator trust from configured shared spaces;
- speaker attribution and eventually identity linking;
- runtime users and roles when the shared model needs them;
- auth/runtime storage that is not git-synced content;
- trusted inter-brain/agent collaboration through signed A2A (RFC 9421 request signing, peer-trust grants, and task-caller binding shipped; the a2a-request-signing plan is retired).

Plans:

- [identity-and-trust.md](./plans/identity-and-trust.md) — the positioning doc for this section: three subject kinds (humans, brains, external clients), the channels they arrive on, and the settled cross-cutting decisions (domain-as-brain-identity, key custody, agent-directory trust establishment) the plans below execute against.
- [multi-user.md](./plans/multi-user.md) — runtime users, roles, active-user checks, attribution, management surfaces, Trusted browser chat, and own-account self-service.
- [auth-runtime-db.md](./plans/auth-runtime-db.md) — database-backed auth, People administration, Admin/Anchor invariants, session migration, normalized identity evidence, and the standalone Admin console are implemented on `feature/auth-runtime-db`; final validation precedes merge.
- [connected-channels.md](./plans/connected-channels.md) — registry-driven, person-centered channel identity attachment without channel enums in auth schema or console code.
- [operator-runtime-db.md](./plans/operator-runtime-db.md) — broader private runtime-state boundary.

### 4. Hosting & operations

Making brains installable, maintainable, and recoverable by operators: fleet/hosting shape, onboarding, and safe offboarding. Driven today by the **hosted personal-brain pilot** (most plans here are pilot ops), but the same machinery hosts the collective posture later. The multi-user admin surfaces depend on the runtime-user model from §3 and cannot land before it; first-passkey bootstrap, Admin-only setup URL retrieval, auth-service plugin bridging, and setup-email delivery have already shipped, so operator onboarding is no longer a standing plan.

This includes:

- hosted/fleet deploy shape and control plane;
- per-user pilot customization and preflight;
- safe offboarding and destructive cleanup for pilot fleets;
- dashboard/admin flows for non-developer operation.

Plans:

- [user-offboarding-plan.md](./plans/user-offboarding-plan.md) — explicit rover-pilot offboarding workflow.
- [discord-opt-in-plan.md](./plans/discord-opt-in-plan.md) — make Discord opt-in in `@rizom/ops` rover-pilot scaffolding, so new pilot users start with Discord disabled unless the operator requests it.

### 5. Interfaces

The chat and editing surfaces brains speak through, kept transport-neutral so Discord, Slack, web-chat, and the CMS share semantics instead of each reinventing them. Discord, Slack, and the bundled web chat ship today; this section is the consolidation and expansion work.

Plans:

- [astryx-adoption.md](./plans/astryx-adoption.md) — exploratory, demand-gated Astryx pilot for the React web-chat console, with explicit Preact boundaries and a go/no-go gate before any CMS or shared adoption.
- [operator-console-pwa.md](./plans/operator-console-pwa.md) — add an optional installable, network-first PWA shell for Dashboard/CMS/web-chat with conservative caching, explicit service-worker scope, standalone safe-area behavior, and no offline-authoring claim.
- [permission-aware-cms.md](./plans/permission-aware-cms.md) — replace the first-party CMS blanket Admin gate with principal-derived visibility, central entity action policy, actor-aware workspaces, and Trusted collaboration without exposing the shared repository credential.
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
- [bd-priority-engine.md](./plans/bd-priority-engine.md) — **in progress on `feat/opportunity-priority-engine`**: capture, deterministic ranking, focus/state suggestions, and the first dashboard slice exist in the worktree. Composition and eval hardening remain; stale-opportunity alerts should now register with the shared recurring-check infrastructure.

### 7. Keep the framework sustainable

These are real, but they should not masquerade as product bets. They reduce drag so product work stays possible. Split here between cleanup that is scheduled when it reduces real drag, and research probes kept as parked thinking until something forces them up the queue.

Cleanup:

- [parallel-eval-workers.md](./plans/parallel-eval-workers.md) — parallelize multi-model eval runs.
- [http-route-registry-hardening.md](./plans/http-route-registry-hardening.md) — normalize the shared HTTP route table, reject collisions, centralize operator authorization, and move toward lifecycle-owned registration without breaking existing plugins.
- [startup-readiness-signal.md](./plans/startup-readiness-signal.md) — stop capturing default identity at boot: move the atproto boot triggers to the plugin `ready()` hook and rename the pre-ready `system:plugins:ready` wire value so nothing is named "ready" before ready exists.

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
