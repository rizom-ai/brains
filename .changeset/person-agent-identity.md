---
"@brains/auth-service": minor
"@brains/utils": patch
"@brains/people": minor
"@brains/dashboard": patch
"@brains/console-theme": patch
"@brains/agent-discovery": patch
"@brains/rover": patch
"@brains/relay": patch
"@brains/web-chat": patch
"@rizom/brain": patch
---

Introduce stable person subjects for auth users and normalized canonical identity claims with independent assertion and verification evidence. Align auth persistence with generated Drizzle Kit migrations and a release-gated, row-preserving bridge for pre-Drizzle databases. Add consent-bearing runtime links between people and agents, Anchor-confirmed agent-person promotion and existing-person linking, private import of non-authenticating agent-carried human DID assertions, exact claim-id reuse with atomic conflict blocking, private exact-match reconciliation that preselects one independently verified person while surfacing cross-person conflicts for Anchor correction, invited-user passkey claiming, self-service representation approval, linked-agent status in the People section of the standalone `/admin` React console, and a Grant access action on approved agent dossiers. Keep the monitoring dashboard free of management UI, expose Admin through route-derived console navigation and the Anchor-gated command palette, and share browser-safe auth role and mutation contracts with the new surface. Harden the internet-facing OAuth flow by rejecting suspended-user sessions at both authorization endpoints, returning MCP bearer claims plus the active principal from one JWT verification, requiring client-bound revocation, applying per-caller and runtime-wide bounds to open dynamic registration, and pruning stale unconsented clients at startup and on scheduled maintenance. Deprecate the ambiguous identity-resolution projection in favor of explicit resolved, denied, or unbound access results, bulk-load the admin roster without per-user query fan-out, avoid duplicate browser-session resolution in web chat, preserve hash-only setup-delivery dedupe independently for every recipient through generated schema migration and a one-shot legacy backfill, centralize legacy record-import scaffolding, pin persisted SHA-256 encodings in shared utilities, centralize private mutation guards plus safe error projection, and split the People console into focused components and dialogs with one shared mutation-feedback path.
