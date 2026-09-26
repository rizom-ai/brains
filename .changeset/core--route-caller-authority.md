---
"@brains/plugins": minor
---

Add `session` route security: a route a signed-in person reaches.

A route declares `security: { kind: "session" }` and nothing else. The runtime resolves the session against the brain's own auth service and reads the person's role, anchor flag and canonical identity from there. A session that is not active — invited, suspended — is nobody, the same as no session.

This is the authority that applies to a browser session, and it is not the one a declared route resolved before. `protocol` routes ask `determineUserLevel` for a per-interface grant, which is right for a channel interface that knows an id on its own transport and nothing about what it is worth here — and wrong for the brain's own operator signed in with a passkey, whom it would answer "public" about. `protocol` keeps doing exactly what it did; `authenticate` returns an actor and never a permission level, because a package's code does not decide what a caller is worth.

`InterfaceActor` gained an optional `canonicalId`. One person reaches the brain over several identities, and a write made in a console attributes to the same person as one made in chat only if the caller carries the link.
