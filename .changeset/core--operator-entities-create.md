---
"@brains/entity-service": minor
"@brains/plugins": minor
---

Complete `operatorEntities` with `create`, backed by `applyEntityCreate` in `@brains/entity-service`.

The core is deliberately narrower than the system create tool rather than an extraction of it. That tool is mostly affordances for an agent — choosing a source to derive from, preserving an upload, running a type's create interceptor, asking for confirmation — while a console has a form and has already assembled the entity. What the two genuinely share is three guards and the write: the type is registered, the policy allows a create at this caller's level, and the caller may write the visibility named. Forcing the remaining 600 lines together would unify two things that only look alike from a distance, so the system create tool is left as it is.

A draft that names no id keeps id policy on the server, where the entity service derives one, rather than in whichever console assembled the draft.
