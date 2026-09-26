---
"@brains/blog": patch
"@brains/decks": patch
"@brains/portfolio": patch
"@brains/social-media": patch
---

Remove the dead `publish:execute` handlers. Nothing sends that message — `content-pipeline`'s scheduler calls the registered provider directly through its publish executor, and its own tests assert no `publish:execute` is emitted. The four entity packages were subscribing to a channel with no publisher, so their entity-type filters, permission assertions, entity loads and success/failure reporting never ran.

The live path is unaffected: each package registers a provider, and the executor prepares content, resolves attachments, calls the provider and records publish state.
