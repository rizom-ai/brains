---
"@brains/core": patch
"@brains/document-plugin": patch
"@rizom/brain": patch
---

Prevent generated document artifacts from creating oversized MCP tool names. Document IDs derived from dedup keys are now bounded with a short deterministic hash suffix instead of embedding full content hashes, and the entity-detail MCP resource template no longer enumerates every entity instance as a discoverable resource.
