---
"@rizom/brain": patch
---

Conversation memory drops its whole-conversation summary projector, which nothing in a running brain called since projection became scheduler-only: the summary extractor, its prompt and AI template, the source reader, the space eligibility check (which never matched a Discord space) and the admin "Conversation memory coverage" widget that measured it. Their evals go too. The plugin's configuration keeps only `memoryVisibility`; the other options were read only by the projector. Stored summaries and decisions are still read, listed and recalled.
