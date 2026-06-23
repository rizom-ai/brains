# Planning docs

This directory is for active or intentionally parked implementation plans. Completed, superseded, and purely historical plans should be deleted once their outcome is captured in the roadmap, changelog, or implementation docs.

## Cleanup policy

Keep a plan here when it still answers one of these questions:

- what should be built next;
- what tradeoff has not been settled;
- what validation remains before a feature is considered done.

Remove or fold a plan when it is implemented, superseded by a narrower plan, or only records past work.

## Current plans by theme

### Relay and product validation

- [Relay presets](./relay-presets.md) — active reference plan
- [Rover core-preset evals](./rover-core-preset-evals.md) — merged; the preset-aware harness (inheritable suites, coverage ledger, permission matrix, multi-user context) is merged to main. Remaining work is the behavioral coverage fill (status/insights/check-job-status, conversation tools, core multi-turn recall)

### Public surface and framework cleanup

- [NPM package boundaries](./npm-package-boundaries.md) — accepted near-term direction; pending curation of which schema helpers go public via `@rizom/brain`
- [Custom brain definitions](./custom-brain-definitions.md) — parked
- [Env handling: declarations and read sites](./env-handling.md) — proposed; consolidates co-located env declarations and moving `process.env` reads out of `shell/core` into the app/deploy layer
- [Unify build pipeline](./unify-build-pipeline.md) — proposed
- [Memory reduction](./memory-reduction.md) — proposed; needs fresh profiling
- [Parallel multi-model eval](./parallel-eval-workers.md) — proposed
- [Plugin contracts consolidation](./plugin-contracts-consolidation.md) — proposed; collapse redundant runtime/public mappers via `Schema.parse`
- [Codebase cleanup backlog](./codebase-cleanup-backlog.md) — reference backlog of unowned findings from the 2026-06 shell audit (CSS monoliths, `@brains/utils` split, package script drift)
- [External dependency review](./external-dependency-review.md) — proposed; dead-weight removal, safe-drift sweep, tooling majors (eslint 8→10, TS 6), and the zod 3→4 migration that blocks the first stable `@rizom/brain`; runs in its own worktree

### Auth, users, CMS, and HTTP

- [A2A request signing](./a2a-request-signing.md) — proposed auth hardening
- [Multi-user and permissions](./multi-user.md) — proposed runtime-user layer
- [Auth runtime database](./auth-runtime-db.md) — proposed auth storage layer
- [Operator runtime database](./operator-runtime-db.md) — proposed runtime-state foundation
- [Turso Database engine evaluation](./turso-database-engine.md) — exploratory; whether the SQLite-from-scratch Rust rewrite unlocks a DB-level/browser sync model (vs today's git sync) that libSQL can't. Sync is whole-DB on both engines (verified), so the embeddings-fold is viable only in a committed git-only branch; pursue DB sync → keep the embedding DB separate
- [First-party CMS editor](./first-party-cms-editor.md) — proposed; replaces the Sveltia browser CMS with a first-party React editor that writes through the entity service (no browser GitHub token, entity DB as single writer, git persistence via directory-sync). Supersedes the GitHub-App token plan
- [Hosted CMS GitHub App tokens](./cms-github-app-hosted.md) — proposed hosted-product CMS login that mints short-lived GitHub App installation tokens for platform-created content repos; superseded if the first-party editor lands (the browser-token problem it hardens disappears)

### Hosted, deployed, and monetized product

- [Rover default batch onboarding](./rover-default-batch-onboarding.md) — active/proposed hosted-pilot follow-up
- [Rover chat-native onboarding](./rover-chat-native-onboarding.md) — proposed in-chat guided apprenticeship for first-run Rover operators
- [Hosted rovers on Kubernetes](./hosted-rovers.md) — proposed hosted-product direction
- [User offboarding workflow](./user-offboarding-plan.md) — proposed rover-pilot fleet workflow

### New interfaces, renderers, and runtimes

- [Discord Chat SDK / web chat feature parity](./chat-interface-sdk.md) — active plan for `@brains/chat` Discord parity plus the immediate queueing/thread-policy enhancements
- [Message-interface semantic tool status](./message-interface-tool-status.md) — proposed shared lifecycle model for tool status updates, with per-interface rendering for web-chat, Discord Chat SDK, and future chat adapters
- [Web search as an explicit tool capability](./web-search-tool.md) — proposed ephemeral-first, provider-neutral `web_search` plugin/tool (Tavily first adapter, Brave planned second); preserves permissions, status events, audit logs, privacy defaults, and citations. Phase 0 first removes the existing `webSearch` config flag, which is verified-dead (no-op) code
- [Slack Chat SDK interface](./slack-chat-sdk.md) — proposed first Slack slice for `@brains/chat`, separate from Discord replacement work
- [Message feedback events](./message-feedback.md) — parked future plan for shared reaction/UI feedback semantics once a feedback sink exists
- [Brain web Chat SDK adapter strategy](./brain-web-chat-sdk-adapter.md) — parked strategy plan for sharing Chat SDK semantics with browser web chat without losing Brain-specific features
- [Chat interface structured forms and modals](./chat-interface-forms-modals.md) — parked future plan for transport-neutral forms and adapter-backed modal/dialog rendering
- [Desktop app](./desktop-app.md) — parked
- [AT Protocol integration](./atproto-integration.md) — active prototype; outbound publishing, registry contracts/routes, and the first bounded discovery slice are live; remaining work is OAuth hardening, discovery filters/Jetstream, and later ingestion/feed work
- [Template renderer contracts](./template-renderer-contracts.md) — proposed; includes the Astro renderer spike
- [Local AI runtime](./embedding-service.md) — partial; remaining sidecar/runtime work
- [Runtime state store](./runtime-state-store.md) — service shipped (`shell/runtime-state`: shell-owned, namespaced, typed store wired into plugin context); consumers (chat subscriptions, playbook run state, notification/setup-email dedupe) pending
- [OKF interop](./okf-interop.md) — proposed; export/import the entity store as Google's Open Knowledge Format bundles via the `directory-sync` layer, for interchange with external OKF producers/consumers
- [MCP external redesign](./mcp-external-redesign.md) — proposed; CQRS split for external MCP — raw read tools stay composable (`readOnlyHint`), all mutations route through a single agent-gated `chat` command (system prompt + permission levels intact); `debug` mode keeps raw write tools local-only; ACP deferred
