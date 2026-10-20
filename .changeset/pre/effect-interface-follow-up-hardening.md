---
"@brains/a2a": patch
"@brains/chat": patch
---

Supervise Discord and Slack Chat SDK listener cycles with one private Effect schedule that drains admitted tasks during stop. Propagate outbound A2A tool cancellation through Agent Card, POST, and SSE operations, use deterministic Effect-owned timeouts, and await stream cancellation before settling.
