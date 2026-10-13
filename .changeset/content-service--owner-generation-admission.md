---
"@brains/content-service": patch
"@brains/core": patch
---

Replace Generation's RPC-incompatible write callback with a bounded data-only admission reference. The shell registers and retires the owner's final authorization guard, which re-resolves current authority, checks the actual mutation operation and validates final serialized fields inside the write transaction. Prompts and caller metadata are not duplicated in admission; existing revision fencing, cancellation and no-replay behavior remain unchanged.
