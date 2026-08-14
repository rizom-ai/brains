---
"@brains/site-info": patch
---

Move `@brains/site-info` from `entities/` to `plugins/` as a compound package, with its entity schema, types, and adapter under `src/entity/`. It pairs one entity with a service that is 1:1 with it — resolving the entity against config defaults and identity fallbacks, then serving and re-broadcasting the result to the site builder — which `entities/AGENTS.md` does not allow an entity package to do. No behaviour change and no package rename; imports of `@brains/site-info` are unaffected.
