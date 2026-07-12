---
"@brains/mcp": patch
"@brains/mcp-service": patch
"@rizom/brain": patch
---

Isolate MCP chat conversations by verified caller and return an opaque conversation handle for explicit follow-ups and confirmations. Authenticated HTTP transports now forward their verified subject into MCP tool context instead of allowing client metadata or a shared fallback identity to collapse unrelated sessions together.
