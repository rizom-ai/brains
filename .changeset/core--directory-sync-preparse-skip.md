---
"@rizom/brain": patch
---

Skip deserialization and schema validation when imported file content already matches the stored canonical hash, while still importing document sidecar metadata changes and reusing the prefetched entity lookup.
