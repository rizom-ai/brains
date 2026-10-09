---
"@brains/a2a": patch
"@brains/agent-discovery": patch
"@brains/ai-service": patch
"@brains/contracts": patch
---

The network can be asked. `network_ask`, a public side-effect-free tool in agent-discovery, picks the approved peers whose skills fit a question (at most three, or the two nearest when none fit), asks them in parallel over a new A2A ask channel with a 6 s budget each (`networkAskTimeoutMs`), and returns every answer with its sources attributed to the brain that gave it, plus who did not answer. Guest turns may use it and are told so; a tool's own `sources` now reach the answer's sources card, so the room lights the answering brain.
