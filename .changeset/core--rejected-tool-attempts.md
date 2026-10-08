---
"@brains/ai-service": patch
---

Agent results keep tool calls the SDK rejected before execution (invalid or malformed input) and calls that threw during execution, as errored tool results. Previously these were dropped, so a successful retry in the same turn erased the rejected attempt from chat records and evaluation traces.
