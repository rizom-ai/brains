---
"@brains/conversation-memory": patch
"@rizom/brain": patch
---

A new entity type, the insight: what a conversation learned or concluded, stored like a decision with the conversation it came from, who stated it and whether it still holds. An insight can be recorded by hand at `shared` or `restricted` visibility, the brain draws on insights from the same space when it answers there, and the dashboard lists recent ones. In the team bundle, trusted users may act on insights as they may on decisions.

With `captureInsights` set in the conversation-memory configuration, the brain also picks insights up from its configured chat spaces as people talk, announces them beside the batch's cards and decisions with an Undo, and supersedes one it wrote when a later finding overturns it. The setting is off by default.
