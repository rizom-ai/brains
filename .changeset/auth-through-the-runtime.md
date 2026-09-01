---
"@brains/sdk": minor
---

Auth capabilities now arrive through the runtime instead of a module
global.

`AuthCaller`, `AuthAudit`, `AuthFederation` and `AuthIdentities` — and the
vocabulary they use
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

Seven packages no longer call `getActiveAuthService()`: dashboard, studio,
mcp, web-chat, a2a, chat and agent-discovery. Only `@brains/admin` still
does; its `AuthAdministration` contract names types from eight auth-service
modules and moves with the slice that converts it.

Tool and reaction contexts carry `auth` too — a tool that grants or revokes
peer trust acts on auth rather than on entities. Named consumer:
`@brains/agent-discovery`.
