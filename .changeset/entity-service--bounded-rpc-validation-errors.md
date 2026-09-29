---
"@brains/entity-service": patch
---

Preserve entity validation phases and field diagnostics across owner RPC using a schema-validated, 16 KiB failure envelope. Bound and sanitize diagnostics without serializing arbitrary error data, retain unknown and aggregate failure graphs, and distinguish valid publication refusals from malformed binary responses.
