---
"@rizom/brain": minor
---

Prepare the 0.3 database migration: use local Turso for every runtime database, route worker persistence through the web owner, consolidate embeddings, and make shutdown durable. Remove engine selection, remote libSQL support, and the auth replica configuration. The packed runtime no longer installs the libSQL client; legacy FTS5 entity files are rejected instead of rewritten in place. A separate database-only 0.2 importer stages and verifies preserved state without modifying the source backup. Full operational migration, content/configuration restore, and verified Turso backup/restore remain release gates. The 0.2 release line remains on libSQL.
