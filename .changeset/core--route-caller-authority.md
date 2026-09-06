---
"@brains/plugins": minor
---

A declared route's authenticator can now say what it already knows about the caller.

`authenticate` may return a permission level and an anchor flag alongside the actor, and the runtime asks its grant machinery only about what it was not told. Every existing channel interface answers with an id alone and is unaffected.

The reason is a difference between two kinds of caller. A channel interface knows an id on its own transport and nothing about what that id is worth here, so `determineUserLevel` resolving a per-interface grant is exactly right. An authenticator that verified a first-party browser session is the other case: it has already read the person's role out of the brain's own user store, and re-deriving it from channel grants answers "public" about the brain's own operator.

`InterfaceActor` also gained an optional `canonicalId`. One person reaches the brain over several identities — a passkey session, a chat account, an email address — and a write made in a console is the same person as one made in chat only if the caller carries the link.
