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

- [Relay presets](./relay-presets.md)
- [Conversation memory](./summary-conversation-memory.md)

### Public surface and framework cleanup

- [Public entity types reconciliation](./public-entity-types-reconciliation.md)
- [NPM package boundaries](./npm-package-boundaries.md)
- [Custom brain definitions](./custom-brain-definitions.md)
- [Canonical env schema](./env-schema-canonical.md)
- [Move env-derived core defaults to app layer](./core-env-config.md)
- [Unify build pipeline](./unify-build-pipeline.md)
- [Brain CLI declaration bundler cleanup](./brain-cli-declaration-bundler-cleanup.md)
- [Memory reduction](./memory-reduction.md)
- [Parallel multi-model eval](./parallel-eval-workers.md)

### Content, sync, and generation

- [Generic cover image orchestration](./generic-cover-image-orchestration.md)

### Auth, users, CMS, and HTTP

- [A2A request signing](./a2a-request-signing.md)
- [Multi-user and permissions](./multi-user.md)
- [Passkey operator onboarding](./passkey-operator-onboarding.md)
- [CMS heavy backend](./cms-heavy-backend.md) — includes the GitHub OAuth proxy interim

### Hosted, deployed, and monetized product

- [Preview domain and origin cert alignment](./preview-domain-cert-alignment.md)
- [Hosted rovers on Kubernetes](./hosted-rovers.md)
- [Hosted Rover Discord UX](./hosted-rover-discord.md)
- [User offboarding workflow](./user-offboarding-plan.md)

### New interfaces, renderers, and runtimes

- [Unified ChatInterface using Vercel Chat SDK](./chat-interface-sdk.md)
- [Desktop app](./desktop-app.md)
- [AT Protocol integration](./atproto-integration.md)
- [Template renderer contracts](./template-renderer-contracts.md) — includes the Astro renderer spike
- [Local AI runtime](./embedding-service.md)
