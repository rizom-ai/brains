---
"@brains/core": minor
"@brains/ai-service": patch
"@brains/mcp-service": patch
---

`system_update` takes exactly one typed `operation`: `{ kind: "fields", fields }`, `{ kind: "content", content }`, `{ kind: "edits", edits }`, or `{ kind: "source", source }`. The flat `fields`, `content`, `edits`, and `source` arguments are removed, and unknown or mixed arguments are rejected by the schema instead of being stripped or reconciled in the handler. Direct callers migrate to the typed operation.

JSON in a content replacement is stored literally; it is no longer inferred as a field update. A confirmation must replay the exact approval args the proposal returned; a confirmed call that omits the operation is rejected instead of being recovered from the pending approval. Approval still pins a user-message source to its message and content hash.

Agent and MCP tool schemas are strict at the root and inside operation branches while plugin-owned field maps stay open, so models and clients see the same contract the handler enforces.
