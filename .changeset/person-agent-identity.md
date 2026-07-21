---
"@brains/auth-service": minor
"@brains/utils": patch
"@brains/admin": minor
"@brains/dashboard": patch
"@brains/console-theme": patch
"@brains/agent-discovery": patch
"@brains/rover": patch
"@brains/relay": patch
"@brains/web-chat": patch
"@rizom/brain": patch
---

Introduce stable person subjects for auth users and normalized canonical identity claims with independent assertion and verification evidence. Align auth persistence with generated Drizzle Kit migrations and a release-gated, row-preserving bridge for pre-Drizzle databases. Add access-neutral links between local people and independent external peer brains, including atomic peer-first invitations and existing-account linking, without inherited roles, identity claims, or attribution. Because the former representation model never shipped outside the feature branch, replace it through a clean generated schema correction rather than a historical data-copy transform or permanent dual-read path.

Replace the unreleased My agents and representation-consent flow with the permanent Overview, Members/People, Invitations, and Audit Admin sections. Show passkeys under Sign-in, verified human-facing email and Discord under Connected channels, and optional external peers as a separate account facet. Keep hosted members without peers profileless, retain CMS ownership of the Anchor profile, omit internal IDs and generic Advanced identity tooling, expose actor-attributed audit events through an Admin-only endpoint and plain-language viewer, and bridge approved directory peers into the Admin invitation flow. Keep the monitoring dashboard free of management UI and expose Admin through route-derived console navigation and the Admin-gated command palette.

Harden the internet-facing OAuth flow by rejecting suspended-user sessions at both authorization endpoints, returning MCP bearer claims plus the active principal from one JWT verification, requiring client-bound revocation, applying per-caller and runtime-wide bounds to open dynamic registration, and pruning stale unconsented clients at startup and on supervised maintenance. Deprecate ambiguous identity-resolution projection in favor of explicit resolved, denied, or unbound access results; bulk-load the Admin roster without per-user query fan-out; avoid duplicate browser-session resolution in web chat; preserve hash-only setup-delivery dedupe per recipient; centralize legacy imports, private mutation guards, safe error projection, mutation feedback, and persisted SHA-256 encodings; and retain exact private identity reconciliation without exposing canonical provider subjects.
