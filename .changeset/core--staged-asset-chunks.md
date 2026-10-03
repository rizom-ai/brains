---
"@brains/assets": patch
"@brains/entity-service": patch
---

Store asset bytes as staged 1 MiB chunks: each chunk commits on its own and yields to the event loop, and the entity mutation publishes the asset header with its reference in one small transaction. Reads stream chunk by chunk, unpublished uploads are discarded after their mutation and swept at startup, and the empty single-BLOB `assets` table is replaced.
