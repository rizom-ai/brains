---
"@rizom/brain": patch
---

Web Chat screens each guest question against the site's `ask-content` topics, and `ask-content` gains an optional `refusal` line: what a visitor reads when their question is off topic, abusive, an injection attempt or harmful. Without it, the visitor reads a neutral line. The team recipe's `ask-content` no longer carries the removed `attribution` field.
