---
"@brains/mcp-service": minor
"@brains/analytics": minor
"@brains/mcp": minor
"@brains/app": patch
---

Certify the MCP basic protocol as a chat-only teammate surface after adding canonical protocol acceptance and a behavioral-eval path. Basic mode advertises only `chat` and `confirm` at every permission level; raw reads and writes remain available to Admin operators in debug mode. The eval runner can now execute selected agent cases through the real basic MCP protocol, including confirmation and follow-up turns.
