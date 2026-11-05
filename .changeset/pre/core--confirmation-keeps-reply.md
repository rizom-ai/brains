---
"@brains/ai-service": patch
"@brains/mcp-service": patch
"@brains/mcp": patch
"@brains/ai-evaluation": patch
"@rizom/brain": patch
---

A reply that proposes an action needing confirmation now keeps what the agent wrote and asks for confirmation below it. Before, the whole reply became "Confirmation required.", so an answer written in the same turn, such as a requested triage note, was lost. When the agent wrote nothing, or wrote only the request, the reply is still just "Confirmation required." The MCP chat tool's confirmation response carries the reply as `text`, and basic-MCP evals read it from there.
