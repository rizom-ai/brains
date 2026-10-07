---
"@rizom/brain": patch
---

Integrate bounded SQLite queue-write retries while preserving sanitized durable SDK error codes, completion clearing, and attempt-ownership fences. Retain deterministic child-ordering coverage and test coded failure persistence under actual write contention.
