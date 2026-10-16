---
"@brains/ai-service": patch
"@rizom/brain": patch
---

Agent shutdown now drains complete admitted model/tool operation Promises, not only their interrupted Effect observations. Caller cancellation stays prompt and preserves its reason, while cancelled or cancellation-ignoring work remains owned until it actually settles. Publish work and close ownership before adapters or abort listeners can reenter shutdown, and retain scope-close failures until the work barrier completes.
