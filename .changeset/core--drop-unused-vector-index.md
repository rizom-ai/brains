---
"@brains/entity-service": patch
---

Stop creating the unused libSQL vector index and drop it idempotently when existing embedding databases initialize. Keep embedding rows, primary-key constraints and cosine-distance search unchanged; remove the obsolete index-creation helper.
