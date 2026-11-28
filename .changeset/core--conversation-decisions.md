---
"@brains/conversation-memory": patch
"@rizom/brain": patch
---

Record a decision by hand: asking the brain to note what was decided now stores a valid decision, taking the conversation it was said in as its source. A decision is never public, so the request states `shared` or `restricted` visibility. A decision's conversation and time range are optional in its stored metadata; decisions already stored read unchanged. Create routes learn the caller's conversation id.
