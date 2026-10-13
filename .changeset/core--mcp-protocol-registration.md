---
"@brains/mcp": patch
"@brains/plugins": patch
"@brains/ai-evaluation": patch
"@rizom/brain": patch
---

Separate MCP protocol registration from HTTP and stdio hosting. Hosted interfaces and protocol-only embeddings share the same tool handlers and registration lifecycle. Add the explicit ProtocolPluginProvider contract and have --mcp-basic use the selected interface's protocol provider without starting listeners or restoring disabled host dependencies. Preserve hosted HTTP dependency and authentication checks.

Add regressions for listener-free registration, canonical headless/personal composition, unsupported providers, and an MCP chat/confirm long-note edit with exact stored-content assertions.
