---
"@rizom/brain": patch
---

When an approved action succeeds but the reply that follows it fails, including a provider decline, the chat shows the action's success result (for example `Completed: Saved note "Roadmap".`) instead of "Error executing …". Only a failure of the action itself is reported as an error, in web chat, Studio chat, chat platforms and MCP.
