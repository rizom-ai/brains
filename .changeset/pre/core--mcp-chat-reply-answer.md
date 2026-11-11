---
"@rizom/brain": patch
---

The MCP `chat` and `confirm` tools reply with the brain's answer, its conversation handle and handles to what it wrote, without the turn's raw tool results. A question that searched many notes could return 60–100 KB of search output beside a few paragraphs of answer, which MCP clients such as the Claude app reported as a failed call. A confirmed write now records its result the way any turn does, so its reply names the saved entity and a job it started is followed like any other.
