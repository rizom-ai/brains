---
"@rizom/brain": patch
---

Fail closed when a guest request crosses its elapsed-time deadline even if the event-loop timer has not run yet or the host resumes after sleep. Invalid or regressing clock readings now cancel guest execution without exposing backend details.
