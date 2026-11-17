---
"@rizom/brain": patch
---

The MCP `httpPort` and A2A `port` settings are gone: both interfaces are served by the brain's own web server and neither setting was read. A `brain.yaml` that still sets one is refused with a message saying to remove it.
