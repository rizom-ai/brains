---
"@rizom/brain": patch
---

A turn the AI provider declines after a tool ran is reported as an error, like every other declined turn, instead of as an ordinary answer. The MCP `chat` and `confirm` tools return such a turn, and any turn that ended in an error, as a failed call, so a client can tell a refusal from an answer.
