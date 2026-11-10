---
"@brains/plugins": patch
"@brains/sdk": patch
"@rizom/brain": patch
---

An operator surface acts as its caller. Its callbacks read through an `EntityReader` (`get`, `list` with paging and sort, `count`) at the caller's visibility, in place of `OperatorEntityReader`, whose `search` had no consumer. Inside a service, every operator callback runs as the operator or viewer who called it, so a slot's `entities` captured elsewhere reads and writes as them too, never as the package. A workspace action's `execute` writes the service's own entity types through its `entities`, attributed to the operator and held to the action policy.
