---
"@brains/entity-service": patch
"@brains/agent-discovery": patch
---

Let entity adapters declare their own publish gate for `publishedOnly` queries. What "published" means belongs to the entity type: an adapter may declare `publishedStatuses` (exact — no status means not published), and query building consults it instead of the shell hardcoding every plugin's lifecycle vocabulary. The agent adapter declares `["approved"]` — approval is the directory's publish gate — fixing the production-only 404 where an approved agent appeared in the directory list but its detail route was never emitted (production builds only whitelisted `published`/`active`/no-status). Non-declaring types keep the default semantics unchanged.
