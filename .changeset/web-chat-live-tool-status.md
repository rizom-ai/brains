---
"@rizom/brain": patch
---

Fix web chat live tool activity status in the published brain runtime. Tool invocation events now broadcast to all interface subscribers and are delivered before tool execution continues, so `/chat` can reliably show transient `Using <tool>…` status while tools run.
