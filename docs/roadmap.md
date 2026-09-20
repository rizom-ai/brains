# brains roadmap

Last updated: 2026-09-13

This is the public-facing view of where `brains` is headed. It records product direction and release readiness; implementation detail belongs in the active plans under [`docs/plans`](./plans/README.md).

## Current status

`brains` is late in the `v0.2.0` alpha cycle. The latest published core release is `@rizom/brain@0.2.0-alpha.373`. The canonical one-brain runtime, capability-bundle contract, React renderer, multi-user identity boundary, independent site/theme release lanes, native Studio Chat, and the main Studio UX consolidation have shipped. Changesets remains in prerelease mode and no final alpha has been nominated.

The remaining `v0.2.0` work is release certification rather than another product-model migration: integrate the intended public-authoring boundary, publish one final alpha, run the complete registry/packed/live/eval evidence against that exact source, prove the candidate on approved canaries and `yeehaa.io`, and obtain explicit authorization before stable publication.

Public `/ask` is a separate product rollout, not a stable-release gate. Its guest runtime and Brain-page integration are published and deployed to the Rizom preview path with admission default-off. Production guest enablement, a fresh paid live acceptance run, and production-page publication remain unapproved.

What exists today:

- one Bun-based CLI and runtime published through `@rizom/brain`;
- one canonical brain definition with eight capability bundles plus policy-only `team`;
- markdown-backed entities with typed frontmatter and directory synchronization;
- MCP-native tools/resources, signed A2A, agent discovery, Discord/Slack, Web Chat, email, and a chat REPL;
- built-in HTTP hosting, passkey/OAuth authentication, multi-user roles, People/Admin surfaces, and connected delivery channels;
- static-site generation with independently versioned site and theme packages;
- React 19 for static SSR and client JSX, with shared StyleX application controls;
- the professional-publishing posture running as the public reference brain; and
- Kamal-based self-hosted deployment with exact package pins, verified backups, health gates, and shared-image verification.

### What stable `v0.2.0` means

`v0.2.0` is a packaging and compatibility milestone. The structural migrations that previously gated it are complete. A release candidate is ready when:

- the intended stable source, including the public authoring boundary, is merged and published as one exact final alpha;
- all eight external authoring fixtures pass declaration, package-boundary, packed-runtime, and exact-registry checks against that alpha and its compatible Site SDK;
- the credentialed live authoring harness and the personal/team eval suites complete with recorded, secret-safe evidence and zero accepted failures;
- the `public` / `shared` / `restricted` visibility contract and documented authoring exports receive final compatibility sign-off;
- the nominated alpha converges cleanly and remains healthy on approved canaries and `yeehaa.io`; and
- an explicit release decision authorizes prerelease exit, site-first stable publication, stable Brain publication, and freezing the `0.2.0` compatibility baseline.

Collective-posture field validation, Public Ask launch, opportunity prioritization, local AI, alternative databases, and other optional capabilities do **not** gate stable `v0.2.0`.

### Current execution focus

An existing worktree does not automatically outrank release work.

| Priority | Outcome                              | Current execution                                                                                                                                                                          |
| -------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **P0**   | Freeze the public authoring boundary | Finish review and integration of `work/plugin-api-boundaries`; preserve the declarative outside-author path and do not retain superseded alpha APIs.                                       |
| **P0**   | Nominate and release stable `v0.2.0` | Publish one final alpha, rerun exact registry/packed/live/eval evidence, certify canaries and `yeehaa.io`, then request explicit stable-release authorization.                             |
| **P1**   | Prove Public Ask                     | Rebuild and inspect the deployed preview, then—only with fresh approval—verify a real public-source question, follow-up, history, and owned deletion. Keep production guest admission off. |
| **P2**   | General content generation           | Shipped in PR #252 (Brain 0.2.0-alpha.379) and verified on smoke; the default site carries a generated section. Studio folders remain a demand-gated follow-up.                            |
| **P2**   | Opportunity-prioritization dogfood   | Finish the single-entity opportunity rework, composition, eval hardening, and focused operator surface without adding it to a default bundle.                                              |

Everything marked parked, proposed, or exploratory below is demand-gated. New work should not preempt P0 without an explicit roadmap change.

## Strategic roadmap

> **One brain, composed from capability bundles. Posture—from private personal use to public professional publishing or shared team memory—is configuration, not a separate product.**

The roadmap is organized around the product and its shared substrate: **§1 the brain and its bundles**, **§2 the postures being validated**, and **§3–§7 shared identity, operations, interfaces, ecosystem, and framework work**.

### 1. The brain and its bundles

The product is one brain composed from fixed capability bundles:

- **`core`** — identity, markdown knowledge, Inbox, MCP stdio, A2A, and agent discovery;
- **`media`** — documents and images;
- **`automation`** — playbooks and onboarding;
- **`web`** — HTTP, auth, Account/Admin, Dashboard, and Studio;
- **`chat`** — platform chat, Web Chat, email, notifications, and conversation memory;
- **`site`** — site-info, site-content, site-builder, and analytics;
- **`publishing`** — blog/post, series, portfolio, decks, pipeline, social, newsletter, and stock-photo workflows;
- **`federation`** — outbound AT Protocol publication and registry capabilities; and
- **`team`** — policy only: shared memory, team instructions, and trusted collaborator permissions.

`headless`, `personal`, `professional`, and `team` recipes expand to explicit `brain.yaml` configuration documented in [brain-model.md](./brain-model.md). The retired Rover/Relay/Ranger packages and runtime presets no longer participate in build, boot, evaluation, initialization, or deployment.

The personal-publishing posture remains the public reference. Product improvements should be driven by durable user friction, weighted by frequency and severity, with disproportionate attention to setup and first-run experience.

Plans:

- [web-search-tool.md](./plans/web-search-tool.md) — provider-neutral, permission-gated, audited web search.
- [system-analytics-tool.md](./plans/system-analytics-tool.md) — one extensible typed analytics/reporting surface.
- [agent-tool-surface-consolidation.md](./plans/agent-tool-surface-consolidation.md) — keep agent, protocol, and CLI exposure distinct and finish the measured tool-surface/eval closeout.
- [operator-view-contract-from-schemas.md](./plans/operator-view-contract-from-schemas.md) — proposed: derive the operator view authoring types from the schemas that already validate them, so the bounds are visible to authors.

### 2. The collective posture

The professional-publishing posture runs in production. The `team` posture remains the active field-validation POC: one shared brain should preserve speaker attribution, produce summaries/decisions/action items, retrieve team memory in context, and become a record participants actually refer back to.

The substrate exists: scoped conversation memory, first-pass attribution, configured shared-space trust, true runtime users, Admin/Anchor separation, and multi-user permission evals. Validation now requires sustained real use over weeks, not another authorization subsystem.

Plans:

- [team-posture-capabilities.md](./plans/team-posture-capabilities.md) — parked, demand-gated team-native capabilities such as meeting notes, decision records, team Q&A, and digest.

### 3. Trust and identity

The runtime identity boundary is shipped: private auth storage, distinct people, roles, per-user state, attribution, cross-interface identities, passkeys, invitations, and signed A2A peer requests. The frontier is real-world trust calibration and completing operator-managed channel attachment without turning the runtime into a multi-tenant SaaS account system.

Plans:

- [identity-and-trust.md](./plans/identity-and-trust.md) — the shared subject, channel, provenance, and trust model.
- [connected-channels.md](./plans/connected-channels.md) — finish registry-driven attach/detach and prove Slack end to end without schema or console changes.
- [operator-runtime-db.md](./plans/operator-runtime-db.md) — the broader private durable operator/security tier beyond shipped auth state.

### 4. Hosting and operations

Brains should be installable, maintainable, observable, and recoverable by an operator. Current work is driven by the hosted personal-brain fleet but must remain posture-neutral.

Plans:

- [user-offboarding-plan.md](./plans/user-offboarding-plan.md) — explicit, recoverable hosted-user offboarding.
- [discord-opt-in-plan.md](./plans/discord-opt-in-plan.md) — make Discord an explicit pilot choice rather than a default.
- [operational-alert-delivery.md](./plans/operational-alert-delivery.md) — deliver sustained operational degradation to a human over a path that survives a dead worker.

### 5. Interfaces

Discord, Slack, standalone `/ask`, native Studio Chat, and the shared Chat protocol ship today. Studio and Dashboard now use the consolidated React/StyleX application grammar; the exploratory Astryx migration was superseded before adoption. The remaining work is product acceptance and bounded follow-up rather than another control-system migration.

Plans:

- [public-ask.md](./plans/public-ask.md) — complete live visitor acceptance and obtain separate production policy/publication approval.
- [studio-ux-improvements.md](./plans/studio-ux-improvements.md) — the remaining reviewed presentation, accessibility, and optional draft-recovery decisions after the shipped UX batches.
- [studio-hierarchical-entity-navigation.md](./plans/studio-hierarchical-entity-navigation.md) — implemented on the feature branch, pending review: virtual folders, scoped search, and folder-aware creation over structured entity paths.
- [operator-console-pwa.md](./plans/operator-console-pwa.md) — optional network-first installable shell without an offline-authoring claim.
- [brain-web-chat-sdk-adapter.md](./plans/brain-web-chat-sdk-adapter.md) — parked strategy for deeper Chat SDK semantic alignment.
- [chat-interface-forms-modals.md](./plans/chat-interface-forms-modals.md) — parked transport-neutral structured forms.
- [message-feedback.md](./plans/message-feedback.md) — parked transport-neutral response feedback pending a real sink.

### 6. Ecosystem

The `0.2` ecosystem target is a credible outside-author path, independently releasable site/theme packages, interoperable discovery, and selected domain packages—not a promise that every internal runtime surface is stable.

Site and theme packages already publish independently with standard peer metadata and exact hosted pins. React is the sole published JSX contract. Completed migration history belongs in package changelogs and the public authoring documentation, not standing plans.

Plans:

- [public-authoring-api-0.2.md](./plans/public-authoring-api-0.2.md) — **P0 release gate**, including integration of the completed declarative-boundary/DX branch, final-alpha evidence, release authorization, stable publication, and baseline freezing.
- [npm-package-boundaries.md](./plans/npm-package-boundaries.md) — narrow official package dependencies and prove an official package through public-only imports.
- [atproto-integration.md](./plans/atproto-integration.md) — finish the safe known-peer discovery tail before any Jetstream canary; later ingestion/feed work remains demand-gated.
- [trustflow-federation-integration.md](./plans/trustflow-federation-integration.md) — proposed asset-catalogue federation, gated on a real external catalogue endpoint.
- [bd-priority-engine.md](./plans/bd-priority-engine.md) — in-flight opportunity capture, ranking, focus, and state suggestions.
- [lead-management.md](./plans/lead-management.md) — inbound qualification over the shared opportunity lifecycle, gated on the opportunity package.

### 7. Keep the framework sustainable

These reduce drag or preserve future options; they are not product bets and do not outrank the release train by default.

Active cleanup and infrastructure plans:

- [durable-binary-assets.md](./plans/durable-binary-assets.md) — move image bytes into same-database content-addressed BLOB storage, then validate a production cutover.
- [parallel-eval-workers.md](./plans/parallel-eval-workers.md) — parallelize multi-model eval subprocesses.
- [http-route-registry-hardening.md](./plans/http-route-registry-hardening.md) — continue security, matching, advertising, and cleanup beyond the shipped normalized registry.
- [directory-sync-export-stall.md](./plans/directory-sync-export-stall.md) — retain fresh incident attribution/recovery work after the shipped semantic Git broker and health checks.
- [topic-extraction-and-reconciliation.md](./plans/topic-extraction-and-reconciliation.md) — incremental extraction, retrieval-assisted canonicalization, production merge, and coverage insight.
- [turso-database-engine.md](./plans/turso-database-engine.md) — active `0.3` Turso-only runtime/migration work; off-thread integration, production recovery, and fleet soak remain open while `0.2` stays on libSQL.

Research probes (parked):

- [alternative-site-renderer-spike.md](./plans/alternative-site-renderer-spike.md) — whether a renderer other than React earns its place at the prepared-build boundary.
- [embedding-service.md](./plans/embedding-service.md) — local AI runtime sidecar direction.

## Product direction

`brains` is intentionally shaped around:

- self-hosted AI knowledge agents;
- markdown as durable source of truth;
- MCP as the default assistant integration layer;
- one brain per instance, composed from capability bundles;
- strong plugin boundaries instead of ad hoc application code; and
- site publishing from the same content graph that powers the agent.

It is not currently targeting:

- multi-tenant SaaS hosting;
- generic autonomous-agent orchestration; or
- a fully stable plugin SDK before `1.0`.

## Reference postures

- **headless** — `core`; no inbound listener.
- **personal** — `core + media + web + chat`; a private console without a public site.
- **professional publishing** — the full ladder through `federation`; the public production reference.
- **collective / team** — the team recipe with policy-only `team`; the active field-validation POC.

External examples should use the professional-publishing posture when they need the full product and the personal posture for the smallest browser-based brain. Rover/Relay/Ranger are historical names, not packages or runtime models.

## Stability

The framework remains pre-stable until `0.2.0` is explicitly nominated and published.

See [STABILITY.md](../STABILITY.md), [CHANGELOG.md](../CHANGELOG.md), and the [public release evidence](./public-release/evidence/AUTHORING_0.2.md).

## Related docs

- [README](../README.md)
- [Architecture Overview](./architecture-overview.md)
- [Brain Model](./brain-model.md)
- [Entity Model](./entity-model.md)
- [Plugin System](./plugin-system.md)
- [Theming Guide](./theming-guide.md)
