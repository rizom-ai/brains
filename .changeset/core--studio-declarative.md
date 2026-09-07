---
"@brains/studio": minor
"@brains/plugins": minor
"@brains/sdk": minor
"@rizom/brain": patch
---

Migrate `@brains/studio` to the declarative surface. The package is one `defineServicePlugin` importing `@brains/sdk` plus the shared libraries it already used; `StudioPlugin` and `studioPlugin` are deleted, and the default export is the service a brain composes.

Studio edits every entity type and declares none. Its writes go through `operatorEntities` as the person using the console, so the policy that says what a caller may do is asked by the runtime, not by the package. Its API routes are declared `security: { kind: "session" }`: the runtime resolves the signed-in person against the brain's own auth service and hands the route a caller with their role, anchor flag and canonical identity. Nothing in the package is handed a principal or decides a level. The shell and its assets stay public routes that redirect an anonymous visitor to sign in.

What changed on the runtime, each with studio as the named consumer:

- **A route that refuses a person says so.** A `session` route nobody is signed in to answers `Authentication required`; a `protocol` route keeps answering `Unauthorized`.
- **Prefix routes.** `match: "prefix"` on a route declaration, for the editor shell that serves every path under its mount and the legacy `/cms`, `/account` and `/admin` redirects.
- **The policy's reason, in its words.** `operatorEntities.refusal(type, action, caller)` returns why the brain's policy refuses, or nothing; `allows` is now the boolean of it. A console shows the person the refusal rather than a refusal of its own.
- **An upload that failed leaves nothing behind.** A handler that refuses or crashes has its staged bytes removed and is reported as a refusal; a policy refusal names the type it was for.
- **`entityDisplay`** on the setup context: the labels a brain configured for its types, read where the editor renders them.
- **`channels.listDescriptors()`**: every channel the brain can be reached on, which the overview counts.
- **`UserPermissionLevel`** on `@brains/sdk/services`.

Two things the class did are gone on purpose. It registered an endpoint and an interaction for the same URL; the console dedupes by path, so only the interaction is declared. And it read web-chat's configured API path off the route list; the chat workspace now reaches web-chat at the contract's default path, which is where a brain composes it unless it says otherwise.

The eight subscriptions — workspace and overview registration and unregistration, and the entity and job activity the overview keeps — are declared, and answer through the runtime's envelope: a handler returns what it has to say and throws a refusal.
