---
"@brains/entity-service": minor
"@brains/core": patch
---

Extract the entity-editing core the system tools and the studio editor were each implementing separately.

`applyEntityEdit` in `@brains/entity-service` owns the five steps every editor of a type it does not own has to take: read the entity at the caller's visibility scope, notice a concurrent write, decide whether the status change crosses the publish boundary, ask the entity-action policy, and check the visibility being written. It takes the policy assertion as a callback, so it depends on no permission package, and it reports what became of the edit — updated, not found, conflict, denied and why — leaving each caller to render that its own way.

`next` is the entity as it should now be rather than a patch. Deciding what a field update means, what an omitted visibility means, and keeping the metadata-backed top-level fields adapters serialize from in step with the metadata all stay with the caller that has the affordance.

`system_update` now sits on it. Its own layer is unchanged: field normalisation, the fields-versus-content validators, the confirmation gate, and the tolerance for models mangling the agent-approval replay. Its pre-confirmation policy check stays too, both so a caller is not invited to approve something that will be refused and because it remains the stricter classifier on the content branch, where it reads the status out of the replacement frontmatter while the core classifies from the entity it is handed.
