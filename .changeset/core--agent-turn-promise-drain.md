---
"@rizom/brain": patch
---

Agent shutdown now drains admitted operation Promises, not only their interrupted Effect observations. Caller cancellation remains prompt with its original reason; cancellation-ignoring work remains owned until settlement. Publish operation and shutdown ownership before adapters or abort listeners can reenter, retain scope-close failures until work drains, and keep admission closure synchronous. This adds no shutdown deadline, forced callback termination or rollback of admitted effects.
