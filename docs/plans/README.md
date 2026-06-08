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
- [Relay eval failure recovery](./relay-eval-failure-recovery.md) — triage from the 2026-05-30 eval run
- [Conversation speaker attribution](./conversation-speaker-attribution.md) — first pass implemented; identity-link follow-ups deferred

### Public surface and framework cleanup

- [NPM package boundaries](./npm-package-boundaries.md) — accepted near-term direction; pending curation of which schema helpers go public via `@rizom/brain`
- [Custom brain definitions](./custom-brain-definitions.md) — parked
- [Env handling: declarations and read sites](./env-handling.md) — proposed; consolidates co-located env declarations and moving `process.env` reads out of `shell/core` into the app/deploy layer
- [Unify build pipeline](./unify-build-pipeline.md) — proposed
- [Memory reduction](./memory-reduction.md) — proposed; needs fresh profiling
- [Parallel multi-model eval](./parallel-eval-workers.md) — proposed
- [Plugin contracts consolidation](./plugin-contracts-consolidation.md) — proposed; collapse redundant runtime/public mappers via `Schema.parse`
- [Job queue claim expiry](./job-queue-claim-expiry.md) — proposed; reclaim stranded `processing` rows after a timeout
- [Search index readiness for playbook gates](./search-index-readiness.md) — proposed; fix KB search semantics and embedding readiness before GoalCheck/onboarding evals

### Content, sync, and generation

- [OG images and printable PDFs on the media rendering substrate](./og-images-pdf-carousels.md) — proposed follow-up for OG images plus printable post/project/product PDFs
- [Content pipeline publish assets](./content-pipeline-publish-assets.md) — proposed abstraction for auto-generating publish-adjacent assets such as OG images

### Auth, users, CMS, and HTTP

- [A2A request signing](./a2a-request-signing.md) — proposed auth hardening
- [Multi-user and permissions](./multi-user.md) — proposed runtime-user layer
- [Auth runtime database](./auth-runtime-db.md) — proposed auth storage layer
- [Passkey operator onboarding](./passkey-operator-onboarding.md) — partial
- [Operator runtime database](./operator-runtime-db.md) — proposed runtime-state foundation
- [Hosted CMS GitHub App tokens](./cms-github-app-hosted.md) — proposed hosted-product CMS login that mints short-lived GitHub App installation tokens for platform-created content repos

### Hosted, deployed, and monetized product

- [Rover default batch onboarding](./rover-default-batch-onboarding.md) — active/proposed hosted-pilot follow-up
- [Rover chat-native onboarding](./rover-chat-native-onboarding.md) — proposed lifecycle-triggered onboarding powered by a generic playbook entity
- [Hosted rovers on Kubernetes](./hosted-rovers.md) — proposed hosted-product direction
- [User offboarding workflow](./user-offboarding-plan.md) — proposed rover-pilot fleet workflow

### New interfaces, renderers, and runtimes

- [Brain web chat surface](./brain-web-ui.md) — MVP shipped; tracks remaining session/artifact/landing follow-ups and deferred public-chat / dashboard-widget work (consolidates the earlier AI Elements adoption plan)
- [Multi-platform chat adapter consolidation](./chat-interface-sdk.md) — parked; design record for a future Chat SDK adapter layer if a second non-web platform (Slack, Teams, Matrix return) gets prioritized
- [Desktop app](./desktop-app.md) — parked
- [AT Protocol integration](./atproto-integration.md) — active prototype; Phase 1/2 outbound publishing is live, the `rizom.ai` registry is verified, and Phase 4 discovery is the next target
- [Template renderer contracts](./template-renderer-contracts.md) — proposed; includes the Astro renderer spike
- [Local AI runtime](./embedding-service.md) — partial; remaining sidecar/runtime work
