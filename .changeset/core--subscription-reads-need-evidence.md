---
"@brains/plugins": minor
"@brains/sdk": minor
---

A narrowed read takes the schema that narrows it

A subscription handler's reader took the entity shape from the caller: ask for a
type and you were handed it, with nothing checking the records matched. A handler
could name a field no entity has, compile, and read `undefined` from it at
runtime, with the failure landing on whatever it computed from that.

`getEntity` and `listEntities` now narrow only when given the schema that
narrows them, and answer with the base entity otherwise. That is the evidence
jobs and data sources have always required. No caller passed a type argument, so
nothing had to change beyond the contract.
