---
"@brains/plugins": patch
"@rizom/brain": patch
---

A declared job's input and result are parsed once. A job is queued with its input as written and parsed by its schema when it runs, whether a tool, a route, an interface, an entity's create route or a workspace action queued it; its result is kept as its handler answered and parsed when its status is read. A transforming schema was parsed again and refused. A workspace action's input reaches the view as the schema's input, and `prepare` and `execute` are each handed it parsed once; a request that goes while a workspace callback runs is answered with the cancellation. An operator surface's `jobs.status` reports a failure in its public form, `code` and public message, instead of the message it was thrown with.
