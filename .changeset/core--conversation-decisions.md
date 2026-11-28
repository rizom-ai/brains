---
"@brains/conversation-memory": patch
"@rizom/brain": patch
---

Decisions from team channels. In a configured chat space the brain picks up what the team decides as people talk, beside the action items it already picks up, and stores each decision at the brain's memory visibility with who decided it.

Record a decision by hand: asking the brain to note what was decided now stores a valid decision, taking the conversation it was said in as its source. A decision is never public, so the request states `shared` or `restricted` visibility. A decision's conversation and time range are optional in its stored metadata; decisions already stored read unchanged. Create routes learn the caller's conversation id.
