# brains roadmap

Last updated: 2026-08-30

This roadmap is the public-facing view of where `brains` is headed.

It focuses on product direction and release readiness, not internal task-by-task tracking. For implementation detail, see the linked plan docs in `docs/plans/`.

## Current status

`brains` is approaching its first stable `v0.2.0` release. The canonical one-brain runtime is merged and published at `0.2.0-alpha.244`; the hosted pilot remains on its prior contract after the first branch-canary crossover was rolled back cleanly. Runtime health passed, but the canary exposed an ops convergence defect: reconciliation and live status rendering both write `views/users.md` with different status semantics. The immediate structural release gate is publishing the narrow `@rizom/ops` ownership fix, regenerating exact-tip staging, and repeating the operator-approved canary window before stable nomination. "Launch" means certifying that unified contract and graduating it to stable `v0.2.0`.

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

- the canonical `@rizom/brain` definition and its eight capability bundles plus policy-only `team` bundle have replaced the built-in Rover/Relay/Ranger model registry and runtime presets;
- checked-in standalone apps and hosted pilot desired state use explicit bundles, and a second reconcile produces no generated drift;
- the runtime APIs surfaced through `@rizom/brain/{plugins,entities,services,interfaces,templates}` have an explicit compatibility sign-off;
- the `public` / `shared` / `restricted` visibility model is accepted as the baseline contract;
- personal-publishing and team-posture eval coverage, packed external-plugin smokes, and package-boundary checks are green on one nominated unified alpha;
- documented init and deploy flows reconcile against standalone and hosted paths;
- that alpha is healthy on the hosted canaries and `yeehaa.io` before Changesets exits prerelease mode.

Then publish stable `0.2.0`, deploy canaries first, and roll through the fleet. Collective-posture field validation (§2), multi-user completion (§3), and optional capabilities do **not** gate stable `v0.2.0`; brain-model unification (§1) now does.

### Current execution focus

Priority is explicit; an existing worktree does not automatically outrank release work.

| Priority | Outcome                            | Current execution                                                                                                                                                                                            |
| -------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **P0**   | One brain composed from bundles    | The runtime is published; fix ops view ownership, regenerate exact-tip pilot staging, then repeat canary crossover only in an approved freeze window with coherent config/image pairs and paired rollback.   |
| **P0**   | Stable `v0.2.0` release candidate  | Freeze and prove the four public authoring use cases, complete clean canary convergence and soak on the corrected release, validate `yeehaa.io`, then exit prerelease mode.                                  |
| **P1**   | Real runtime identity boundary     | Implementation is complete on `main`: runtime auth storage, multi-user boundaries, People/Admin surfaces, invitations, connected delivery channels, and obsolete compatibility-path removal are implemented. |
| **P1**   | Finish Rizom consolidation tail    | Production cutover, redirects, and staging retirement are complete; retire old Work/Foundation origins, archive superseded repos, and remove obsolete deployment paths after the rollback window.            |
| **P2**   | Opportunity-prioritization dogfood | Finish and merge the in-flight capture/ranking/focus slice without adding it to a default bundle. Recurring stale alerts adopt the shared recurring-check service once that slice merges.                    |

Everything marked parked or exploratory below is demand-gated. New work should not preempt P0/P1 without an explicit roadmap change.

## Strategic roadmap

The central product bet is now explicit:

> **One brain, composed from capability bundles. What used to be three models (rover, relay, ranger) is a single brain whose posture — from personal publishing to shared team memory — is selected by bundles at deploy time. The bet: one brain that scales from a single person to a collective without switching products.**

This is a deliberate change from the previous "two product tracks" framing. There is one product. **Posture is configuration, not a separate product:** the `professional` recipe selects the public publishing stack; the `team` recipe selects the collaborative policy; both are the same brain. So the roadmap is organized as: **§1 the brain and its bundles** (what the product is), **§2 the postures we have proven** (the personal→collective validation arc), and **§3–§7 the shared substrate** every brain runs on — grouped by capability, never attributed to one posture.

The frontier moved with the framing. Once posture is just configuration, the open problem is no longer "prove the team product" — it is **multi-user** (§3), the one thing posture-as-config cannot fake. Implementation plans remain in [docs/plans](./plans/README.md); the roadmap should answer what the work supports.

### 1. The brain and its bundles

The product is one brain, composed from fixed **capability bundles** — named groups of plugins plus bounded config, permission, instruction, and eval defaults:

- **`core`** — identity, markdown knowledge, Inbox, MCP stdio, A2A, and agent discovery.
- **`media`** — documents and images.
- **`automation`** — playbooks and onboarding.
- **`web`** — HTTP, auth, account/admin, Dashboard, and Studio.
- **`chat`** — platform chat, web chat, email, notifications, and conversation memory.
- **`site`** — site-info, site-content, site-builder, and analytics.
- **`publishing`** — blog/post, series, portfolio, decks, pipeline, social, newsletter, and stock-photo workflows.
- **`federation`** — outbound AT Protocol publication and registry capabilities.
- **`team`** — policy only: shared memory, team instructions, and trusted collaborator permissions over selected members.

Posture is explicit `brain.yaml` configuration. `headless`, `personal`, `professional`, and `team` recipes expand to the fixed ladder documented in [brain-model.md](./brain-model.md). `site` and `publishing` remain independent, and instances tune at the edges with visible `add`/`remove` plus plugin config.

**The structural bet that makes this true** has shipped on the alpha line: the three model packages and preset runtime are gone, and one canonical definition owns the bundle primitive. The remaining work is operational certification of that contract through clean pilot convergence, canary soak, and stable release.

The personal-publishing posture is the public reference and must stay sharp without the team posture. The operating model for it is reactive: real users on `yeehaa.io`, `mylittlephoney.com`, and the Rizom variants surface friction a POC won't —

- one capture channel so reported friction does not get lost;
- prioritize by frequency × severity, not by what looks interesting to fix;
- bias toward small ships that propagate via the next deploy;
- give setup/first-run friction disproportionate weight — current users are past the onboarding wall, so it is invisible from inside the project but lethal for anyone new;
- keep the friction queue durable so the same papercut is not re-reported and re-deferred silently.

The bundled web chat UI (`/chat` — sessions, confirmations, uploads, progress, attachments, sources, suggested actions) and the media/OG pipeline (PDF carousels, printable PDFs, OG images, publish assets) both landed and are now maintained through normal bug/release work rather than standing plans. Media rendering now owns each browser through scoped, cancellable acquisition and bounded process cleanup behind its existing Promise API.

Plans:

- [brain-model-unification.md](./plans/brain-model-unification.md) — **the headline structural work**: collapse rover/relay/ranger into one brain, introduce capability bundles, retire presets in favor of bundles + `brain init` recipes. Supersedes the three-reference-model framing.
- [identity-and-trust.md](./plans/identity-and-trust.md) — shared identity and trust architecture across humans, external clients, peer brains, and platform users.
- [web-search-tool.md](./plans/web-search-tool.md) — provider-neutral `web_search` capability (Tavily first), permission-gated and audited; Phase 0 removes the verified-dead `webSearch` config flag.
- [system-analytics-tool.md](./plans/system-analytics-tool.md) — rename/reframe `system_insights` as an extensible typed analytics/reporting surface, folding plugin reports such as Cloudflare traffic into one LLM-facing tool.
- [agent-tool-surface-consolidation.md](./plans/agent-tool-surface-consolidation.md) — separate agent/protocol/CLI exposure, remove maintenance and MCP adapters from model context, and consolidate playbook, directory-sync, and publishing lifecycle tools behind typed canonical surfaces.

### 2. The collective posture (active POC)

The `team` recipe posture is the one still being validated — the professional publishing posture already runs in production (§1). The proof is not "many personal bots in one room"; it is one shared brain that can:

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

The runtime substrate is implemented: distinct people have private auth users, roles, per-user state, canonical attribution, and cross-interface identity links. Admin permission and Anchor ownership are independent facets. The auth runtime database and multi-user foundation shipped in `@rizom/brain@0.2.0-alpha.239`; durable implementation details live in the [`auth-service` README](../shell/auth-service/README.md). The frontier now moves to real-world trust calibration, profile-on-subjects, and sustained collective-brain validation.

It carries a genuine architectural puzzle: content is markdown/git-synced and shareable, but user identity and auth **must not** be git-synced — so multi-user needs a second data plane (a runtime DB) beside the content plane. This is **not posture-specific**: every brain runs on the same auth, runtime-user, and signing layer. The bar is enough identity and provenance to support real collaboration without prematurely becoming a full SaaS account system.

This includes:

- collaborator trust from configured shared spaces;
- speaker attribution and eventually identity linking;
- runtime users and roles when the shared model needs them;
- auth/runtime storage that is not git-synced content;
- trusted inter-brain/agent collaboration through signed A2A (RFC 9421 request signing, peer-trust grants, and task-caller binding shipped; the a2a-request-signing plan is retired).

Plans:

- [identity-and-trust.md](./plans/identity-and-trust.md) — the positioning doc for this section: three subject kinds (humans, brains, external clients), the channels they arrive on, and the settled cross-cutting decisions (domain-as-brain-identity, key custody, agent-directory trust establishment) the plans below execute against.
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

The chat and editing surfaces brains speak through, kept transport-neutral so Discord, Slack, web-chat, and Studio share semantics instead of each reinventing them. Discord, Slack, and the bundled web chat ship today; this section is the consolidation and expansion work.

Plans:

- [astryx-adoption.md](./plans/astryx-adoption.md) — exploratory, demand-gated Astryx pilot for the React web-chat console, with explicit Preact boundaries and a go/no-go gate before any Studio or shared adoption.
- [operator-console-pwa.md](./plans/operator-console-pwa.md) — add an optional installable, network-first PWA shell for Dashboard/Studio/web-chat with conservative caching, explicit service-worker scope, standalone safe-area behavior, and no offline-authoring claim.
- [studio-chat-integration.md](./plans/studio-chat-integration.md) — move the authenticated browser Chat presentation into a conditional fixed Studio workspace while Web Chat retains API, streaming, session, upload, and conversation authority.
- [brain-web-chat-sdk-adapter.md](./plans/brain-web-chat-sdk-adapter.md) — parked strategy; how browser web-chat can share Chat SDK semantics with Discord/Slack/etc. without losing Brain-specific web-chat features.
- [chat-interface-forms-modals.md](./plans/chat-interface-forms-modals.md) — parked; transport-neutral structured forms that render as platform-native UI (Discord modals, Slack/Teams forms, web-chat dialogs) once adapter support exists.
- [message-feedback.md](./plans/message-feedback.md) — parked; transport-neutral thumbs-up/down feedback capture from chat interfaces, pending a real feedback sink/use case.

Shipped from this section:

- [Studio's responsive interface grammar](./plans/studio-ux-research.md) — one host-owned page head, collection query line, source-declared compact-row reflow, explicit primary-action placement, two-bar phone chrome, and fixed-workspace frame across library, editor, Account, Overview, and declarative workspaces;
- Studio consolidation — the CMS was renamed to Studio; administration and Account presentation moved into its capability-gated workspace shell without moving auth authority; Overview became the operator home; Dashboard became the anonymous public brain card;
- inbound email intake — `interfaces/email` owns the inbound half of the email channel (IMAP daemon, at-least-once `EMAIL_INBOUND` events, sender identity enrichment), plus the private locator-backed bounded source reader used by Admin detail, drafting, and confirmed sends. Deliberately non-conversational: inbound mail never reaches agent chat;
- [the unified inbox](../plugins/unified-inbox/README.md) — live source-owned attention, Admin Studio and headless readers, linkable facets, verified contacts, destination-owned universal and source-declared launches, bounded transient source detail, recurring-check and mail sources, and title-only digest without a second store;
- [`@brains/email-workflows`](../plugins/email-workflows/README.md) — one opt-in email feature package grouping safe derived triage, new-mail Inbox projection, and private bounded source reads while retaining its tested reply backend dormant and outside runtime composition.

### 6. Ecosystem

A credible public ecosystem: package boundaries, distribution/discovery, interop, and authoring surfaces that make the work legible outside the repo.

This includes:

- public package boundaries for official plugins/entities;
- stable-enough authoring surfaces;
- distribution/discovery and interchange where they support the story.

Plans:

- [public-authoring-api-0.2.md](./plans/public-authoring-api-0.2.md) — **P0 stable-release gate**: implementation, eight-package alpha evidence, and tested site-first stable orchestration are complete; final-alpha/live evidence, authorization, and stable baseline freezing remain.
- [npm-package-boundaries.md](./plans/npm-package-boundaries.md) — narrow official publishable plugin/entity dependencies; the utils grab-bag has been broken up (ops, contracts, content-formatters, image, ui-library, site-composition) so remaining work is curation of public surfaces and one official plugin proof.
- [site-package-independent-versioning.md](./plans/site-package-independent-versioning.md) — give deployable site and theme packages independent npm releases, published brain-compatibility metadata, and reviewed exact hosted pins that remain valid when packages move to external repositories.
- [atproto-integration.md](./plans/atproto-integration.md) — active prototype for distribution/discovery; outbound publishing, registry contracts/routes, and the first bounded discovery slice are implemented. Remaining work is OAuth hardening, configurable discovery/Jetstream, and later ingestion/feed work.
- [bd-priority-engine.md](./plans/bd-priority-engine.md) — **in progress on `feat/opportunity-priority-engine`**: capture, deterministic ranking, focus/state suggestions, and the first dashboard slice exist in the worktree. Composition and eval hardening remain; stale-opportunity alerts should now register with the shared recurring-check infrastructure.
- [lead-management.md](./plans/lead-management.md) — **email triage has shipped; now gated on the shared `opportunity` entity**: turn configured mail categories into restricted leads, use bounded AI resolution to consolidate multiple mail items per opportunity, and provide reversible merge/split/reassignment before optional promotion into `@brains/business-development`.

### 7. Keep the framework sustainable

These are real, but they should not masquerade as product bets. They reduce drag so product work stays possible. Split here between cleanup that is scheduled when it reduces real drag, and research probes kept as parked thinking until something forces them up the queue.

Cleanup:

- [durable-binary-assets.md](./plans/durable-binary-assets.md) — move durable image bytes from base64 entity rows into a content-addressed asset store, validate the cutover on `yeehaa.io`, then migrate PDF documents as an independent follow-up phase.
- [parallel-eval-workers.md](./plans/parallel-eval-workers.md) — parallelize multi-model eval runs.
- [http-route-registry-hardening.md](./plans/http-route-registry-hardening.md) — normalize the shared HTTP route table, reject collisions, centralize operator authorization, and move toward lifecycle-owned registration without breaking existing plugins.
- [directory-sync-export-stall.md](./plans/directory-sync-export-stall.md) — root-cause class confirmed: an unresolved Bun Git completion can wedge auto-export; merged checkpoint/health recovery remains paired with fresh, approval-gated incident attribution.
- [operational-alert-delivery.md](./plans/operational-alert-delivery.md) — follow the released background-recovery foundation with sustained operational-degradation delivery over a web-process path that survives a dead worker, with deduplicated episodes that resolve, then land client-side error capture on the same spine.
- [packed-compatibility-test-tiering.md](./plans/packed-compatibility-test-tiering.md) — keep focused tests and one packed canary in normal PR feedback, move the full external-authoring matrix to nightly/release evidence, reuse one packed artifact per run, and freeze the `0.2.0` fixtures for later patch-candidate compatibility.
- [topic-extraction-and-reconciliation.md](./plans/topic-extraction-and-reconciliation.md) — make topic extraction incremental (waves currently re-extract the whole corpus), feed the extraction prompt embedding-retrieved nearest topics instead of a flat 40-title list, wire the semantic merge sweep into the production wave path (today it only runs in evals), and surface a zero-LLM topic-coverage insight from the knowledge-map geometry.
- [preact-to-react-consolidation.md](./plans/preact-to-react-consolidation.md) — **implemented on `work/react-renderer-consolidation`, awaiting merge and prerelease publication**: React 19 now owns static SSR and client JSX, the renderer flip is guarded by semantic output fixtures, public site peers and docs use React, the Dashboard and Studio share one operator-view host, and the old containment tsconfig split is gone. This must merge and publish before `changeset pre exit`; afterward the same authoring-contract change requires `0.3.0`.
- [contract-drift-fixes.md](./plans/contract-drift-fixes.md) — from a full-repo duplication audit: collapse the duplicated site-metadata schema that silently dropped `represents`, derive ATProto record strictness from the lexicons instead of one hardcoded field list, and guard the published-SDK type copies that no test currently pins.

Research probes (parked):

- [alternative-site-renderer-spike.md](./plans/alternative-site-renderer-spike.md) — whether any renderer other than Preact earns its place now that builds are prepared into a serializable snapshot.
- [embedding-service.md](./plans/embedding-service.md) — local AI runtime sidecar direction.
- [configurable-embedding-provider.md](./plans/configurable-embedding-provider.md) — make the embedding model and dimensions user-configurable at initialization (they are hardcoded today behind a dead config block), and fail fast with an explicit re-embed remedy when a configured dimension does not match stored vectors.
- [entity-surface-layering.md](./plans/entity-surface-layering.md) — decided: directory-sync stays a plugin and the bulk/export surface stays plugin API; the surface shape is release-gate work — managed batch bracket, release-final journal naming, and `recoverProjectionBatches` off the plugin surface before stable `v0.2.0`.
- [turso-database-engine.md](./plans/turso-database-engine.md) — **complete through Phase 5G; MVCC parked behind saturation**: local files default to Turso Database with packed native bindings, dual-engine parity, and production-shaped cutover coverage. Git remains the only content sync model. Phases 5A–5C make web the sole local shell database owner under WAL, route worker persistence through the private endpoint, enforce a packed worker no-local-open fence, and store regenerated embeddings atomically with entities in `brain.db`. Phase 5D replaces both engine-specific search indexes with the measured portable phrase boost. Phase 5E atomically journals embedding-job intents with entity mutations and relays them idempotently to the separate job database. Phase 5F removes unreleased native-FTS compatibility. Phase 5G removes obsolete multiprocess WAL, awaits durable native shutdown, and ports worker expiry plus operational queue/projection diagnostics across the owner RPC boundary. MVCC remains intentionally parked until owner-connection saturation is observed.

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

- **headless** — `core`; no inbound listener.
- **personal** — `core + media + web + chat`; a private console without a public site.
- **professional publishing** — the full capability ladder through `federation`; the public reference, live in production (formerly the `rover` model).
- **collective / team** — the team recipe with policy-only `team` plus explicit `docs`; the active POC (formerly the `relay` model).

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
