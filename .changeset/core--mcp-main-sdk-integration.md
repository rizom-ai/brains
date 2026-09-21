---
"@rizom/brain": patch
"@brains/mcp": patch
"@brains/analytics": patch
---

Integrate main's chat-only basic MCP policy into the declarative interfaces without restoring retired implementations. Keep basic as the default server mode, expose built-in chat and confirm there, and make ordinary tools (including Analytics and Inbox) debug-only unless explicitly opted into basic. Keep debug mode Admin-gated. Clarify the distinction between server mode, direct tool exposure, and internal agent availability. Preserve batched projection intent application alongside main's extracted wave coordinator.
