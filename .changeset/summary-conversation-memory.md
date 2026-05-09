---
"@brains/summary": minor
"@brains/app": minor
"@brains/core": minor
"@brains/plugins": minor
"@brains/test-utils": patch
---

Add Relay-oriented conversation memory for summaries.

Summaries now derive durable team memory only from configured conversation `spaces`, use delayed skip-deduplicated projection jobs, and ask AI to decide whether to skip, update, or append based on stored messages plus the existing summary. The dashboard widget now reports Conversation Memory coverage, stale summaries, unsummarized eligible conversations, and recent summary status.

Add top-level `spaces` plumbing through app/core/plugin contexts and test utilities so deployed brains can define shared team conversation spaces in `brain.yaml`.
