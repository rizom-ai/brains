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
- [Publish action policy](./publish-action-policy.md) — proposed follow-up for draft/edit vs publish authorization
- [Conversation memory](./summary-conversation-memory.md) — partial; remaining policy/eval tightening
- [Conversation speaker attribution](./conversation-speaker-attribution.md) — first pass implemented; identity-link follow-ups deferred

### Public surface and framework cleanup

- [NPM package boundaries](./npm-package-boundaries.md) — accepted near-term direction; pending curation of which schema helpers go public via `@rizom/brain`
- [Custom brain definitions](./custom-brain-definitions.md) — parked
- [Canonical env schema](./env-schema-canonical.md) — proposed
- [Move env-derived core defaults to app layer](./core-env-config.md) — proposed
- [Unify build pipeline](./unify-build-pipeline.md) — proposed
- [Memory reduction](./memory-reduction.md) — proposed; needs fresh profiling
- [Parallel multi-model eval](./parallel-eval-workers.md) — proposed

### Content, sync, and generation

- [Generic media generation and saved artifacts](./generic-media-generation.md) — remaining unification work after the durable document/PDF carousel path
- [OG images on the media rendering substrate](./og-images-pdf-carousels.md) — remaining OG image phase after the PDF carousel MVP

### Auth, users, CMS, and HTTP

- [A2A request signing](./a2a-request-signing.md) — proposed auth hardening
- [Multi-user and permissions](./multi-user.md) — proposed runtime-user layer
- [Auth runtime database](./auth-runtime-db.md) — proposed auth storage layer
- [Passkey operator onboarding](./passkey-operator-onboarding.md) — partial
- [Operator runtime database](./operator-runtime-db.md) — proposed runtime-state foundation
- [CMS GitHub OAuth proxy](./cms-github-oauth-proxy.md) — proposed small interim proxy for Sveltia's existing GitHub backend
- [CMS heavy backend](./cms-heavy-backend.md) — proposed long-term brain-hosted git gateway for CMS writes

### Hosted, deployed, and monetized product

- [Rover default batch onboarding](./rover-default-batch-onboarding.md) — active/proposed hosted-pilot follow-up
- [Hosted rovers on Kubernetes](./hosted-rovers.md) — proposed hosted-product direction
- [User offboarding workflow](./user-offboarding-plan.md) — proposed rover-pilot fleet workflow

### New interfaces, renderers, and runtimes

- [Brain web chat surface](./brain-web-ui.md) — MVP shipped; tracks remaining session/artifact/landing follow-ups and deferred public-chat / dashboard-widget work (consolidates the earlier AI Elements adoption plan)
- [Structured chat confirmations](./structured-chat-confirmations.md) — ready / unblocked; align web-chat, Discord, and chat-repl behind a shared structured tool/approval contract
- [Multi-platform chat adapter consolidation](./chat-interface-sdk.md) — parked; revisits multi-platform Chat SDK direction only when a new platform is prioritized
- [Desktop app](./desktop-app.md) — parked
- [AT Protocol integration](./atproto-integration.md) — parked
- [Template renderer contracts](./template-renderer-contracts.md) — proposed; includes the Astro renderer spike
- [Local AI runtime](./embedding-service.md) — partial; remaining sidecar/runtime work
