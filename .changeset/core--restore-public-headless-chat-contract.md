---
"@rizom/brain": minor
---

Restore `@rizom/brain/chat` as the headless Chat domain and transport contract after its temporary alpha rollback. The restored surface uses neutral `Chat*` names rather than the removed `BrowserChat*` alpha names. It provides versioned schemas, bounded API paths, a stateless stream decoder, and a fetch-injected client for conversations, context handoff, messages, streaming, uploads, approvals, actions, progress, and durable job status without exporting React, routing, cache, storage, or other presentation logic.
