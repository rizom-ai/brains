---
"@brains/auth-service": minor
"@brains/people": minor
"@brains/dashboard": patch
"@brains/console-theme": patch
"@brains/agent-discovery": patch
"@brains/rover": patch
"@brains/relay": patch
"@rizom/brain": patch
---

Introduce stable person subjects for auth users and normalized canonical identity claims with independent assertion and verification evidence. Align auth persistence with generated Drizzle Kit migrations and a release-gated, row-preserving bridge for pre-Drizzle databases. Add consent-bearing runtime links between people and agents, Anchor-confirmed agent-person promotion and existing-person linking, private import of non-authenticating agent-carried human DID assertions, exact claim-id reuse with atomic conflict blocking, invited-user passkey claiming, self-service representation approval, linked-agent status in the People section of the standalone `/admin` React console, and a Grant access action on approved agent dossiers. Keep the monitoring dashboard free of management UI, expose Admin through route-derived console navigation and the Anchor-gated command palette, and share browser-safe auth role and mutation contracts with the new surface. Harden the internet-facing OAuth flow by rejecting suspended-user sessions at both authorization endpoints and returning MCP bearer claims plus the active principal from one JWT verification.
