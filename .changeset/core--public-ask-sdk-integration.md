---
"@rizom/brain": patch
"@brains/plugins": patch
"@brains/web-chat": patch
"@brains/conversation-service": patch
"@brains/runtime-state": patch
"@brains/http-host": patch
"@brains/core": patch
"@brains/scheduler": patch
"@brains/agent-discovery": patch
---

Integrate Public Ask with declarative routes, owner-qualified state, and draining daemon shutdown without restoring retired interface classes. Centralize the reusable maintenance runner in the scheduler package rather than importing plugin runtime internals. Preserve trusted socket context across request admission and expose listener binding through `http.hostname`.

Keep guest transcripts out of SDK bulk reads and change cursors. Reconcile atomic state compare-and-set with parsed snapshots and persisted wire inputs, including transformed schemas, defaults, JSON null, and independent connections.

Include the compiled empty-state styles in the standalone proximity-map stylesheet.
