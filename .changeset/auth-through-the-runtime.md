---
"@brains/sdk": minor
---

The auth caller, audit trail and federation view now arrive through the
runtime.

`AuthCaller`, `AuthAudit` and `AuthFederation` — and the vocabulary they use
(`AuthPrincipal`, `AuthBearerGrant`, `VerifiedAccessToken`, the audit event
types, the A2A trust record and signing key) — move to
`@brains/plugins`, where a package can name them without depending on the
service that implements them. It could not depend on it: auth-service is
itself a service plugin built on the plugin context, so the arrow only runs
one way. auth-service imports these and implements them nominally, so the
class and the contract cannot drift apart silently.

The running implementation is published through a shell registry that
auth-service registers itself with on register and withdraws from on
shutdown, reachable as `context.auth`. A brain with no auth-service reads
`undefined` — the honest answer, and the one a module-level global could not
give a package that had already imported it.

`@brains/dashboard`, `@brains/studio`, `@brains/mcp`, `@brains/web-chat` and
`@brains/a2a` no longer call `getActiveAuthService()`. Three consumers still
do, each wanting a surface this slice did not measure: `@brains/admin`
(administration), `@brains/chat` (identity access) and
`@brains/agent-discovery` (granting peer trust). Those contracts move with
the slices that need them.
