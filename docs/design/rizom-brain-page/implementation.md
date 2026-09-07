# Brain landing-page implementation

Last updated: 2026-09-13

## Status

The Brain page and its Public Ask integration are implemented, published, and deployed to the Rizom preview path. The current deployment runs core `0.2.0-alpha.372` with `@rizom/site-rizom-ai@0.2.0-alpha.251`; guest admission remains default-off and the production page has not been republished.

The original standalone mockup in this directory remains design evidence, not the production source of truth. Authoritative copy lives in `rizom-content`; rendering, guest assets, and contracts live in `brains`.

## Shipped page

- Schema-driven rendering in `sites/rizom-ai/src/brain.tsx`.
- Seven authored sections: hero, Answers, Capabilities, Collective, You/Team/Network, Stays yours, and Quickstart.
- Real capability-bundle configuration rather than the rejected generic icon grid.
- Shared site chrome, themes, responsive behavior, and registered capture assets.
- Homepage map styling reused on the Brain route rather than duplicated under a second token system.
- The existing `#brain-chat` hero box enhanced by the shared guest runtime; no second panel or chat engine.
- Topic hints fill the composer but never submit automatically.
- Lazy guest assets, fixed-height desktop conversation shell, visual-viewport mobile layout, safe Markdown, and bounded source cards.
- “Continue in `/ask`” preserves the same owned conversation without putting credentials or transcripts in the URL.

## Verification completed

- Site package build, typecheck, lint, and focused/full site tests.
- Desktop and phone browser coverage in both climates.
- Canonical running-app preview rebuilds with generation disabled or synthetic providers.
- Same-brain synthetic verification of one guest question, model/tool loop, prepaid query embedding, and native network presentation.
- Published-package canary, warm package/content rollout rehearsal, pre-promotion rollback, verified deployment backup, and operational-health checks.
- Production output remained unchanged through package and content preview rollout.

Detailed checkpoint evidence remains in Git history and the retained files under [`evidence/`](./evidence/). The active backlog is intentionally not duplicated here.

## Remaining rollout work

The latest site package deployment did not rebuild generated preview output. An authenticated app-managed preview rebuild must still prove the deployed map markup/style and final Brain-page presentation. The available MCP credential was rejected and was not bypassed.

After preview acceptance, [the Public Ask plan](../../plans/public-ask.md) still requires:

- fresh approval for any paid provider call;
- independently observed real question, follow-up, source, refresh/history, and owned deletion behavior;
- production provider/abuse/retention/disclosure policy;
- explicit production-page publication approval; and
- separate explicit guest-enablement approval.

Guest access remains off until those gates close. A deployed package or successful synthetic test is not production activation.
