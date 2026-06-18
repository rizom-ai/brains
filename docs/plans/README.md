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
- [Rover core-preset evals](./rover-core-preset-evals.md) — landing; the preset-aware harness (inheritable suites, coverage ledger, permission matrix, multi-user context) is merged. Remaining work is the behavioral coverage fill (status/insights/check-job-status, conversation tools, core multi-turn recall)

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
- [Search index readiness for playbook gates](./search-index-readiness.md) — implemented readiness/backfill plan; retained as reference for playbook gate and eval-readiness behavior

### Auth, users, CMS, and HTTP

- [A2A request signing](./a2a-request-signing.md) — proposed auth hardening
- [Multi-user and permissions](./multi-user.md) — proposed runtime-user layer
- [Auth runtime database](./auth-runtime-db.md) — proposed auth storage layer
- [Operator runtime database](./operator-runtime-db.md) — proposed runtime-state foundation
- [Hosted CMS GitHub App tokens](./cms-github-app-hosted.md) — proposed hosted-product CMS login that mints short-lived GitHub App installation tokens for platform-created content repos

### Hosted, deployed, and monetized product

- [Rover default batch onboarding](./rover-default-batch-onboarding.md) — active/proposed hosted-pilot follow-up
- [Rover chat-native onboarding](./rover-chat-native-onboarding.md) — proposed in-chat guided apprenticeship for first-run Rover operators
- [Hosted rovers on Kubernetes](./hosted-rovers.md) — proposed hosted-product direction
- [User offboarding workflow](./user-offboarding-plan.md) — proposed rover-pilot fleet workflow

### New interfaces, renderers, and runtimes

- [Multi-platform chat adapter consolidation](./chat-interface-sdk.md) — parked; design record for a future Chat SDK adapter layer if a second non-web platform (Slack, Teams, Matrix return) gets prioritized
- [Slack Chat SDK interface](./slack-chat-sdk.md) — proposed first Slack slice for `@brains/chat`, separate from Discord replacement work
- [Desktop app](./desktop-app.md) — parked
- [AT Protocol integration](./atproto-integration.md) — active prototype; outbound publishing, registry contracts/routes, and the first bounded discovery slice are live; remaining work is OAuth hardening, discovery filters/Jetstream, and later ingestion/feed work
- [Template renderer contracts](./template-renderer-contracts.md) — proposed; includes the Astro renderer spike
- [Local AI runtime](./embedding-service.md) — partial; remaining sidecar/runtime work
- [OKF interop](./okf-interop.md) — proposed; export/import the entity store as Google's Open Knowledge Format bundles via the `directory-sync` layer, for interchange with external OKF producers/consumers
