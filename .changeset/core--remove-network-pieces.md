---
"@rizom/brain": patch
---

A brain no longer copies what other brains publish. The `network-piece` entity type, its daily sync and its citations are gone; the live `network_ask` lane answers from other brains instead. On start, a brain deletes the pieces it kept before, with their search index, embeddings and files. FAQs no longer wait for review when a cited piece is withdrawn. The entity service can purge a type no plugin registers any more (`purgeEntityType`).
