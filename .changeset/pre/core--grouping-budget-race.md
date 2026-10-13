---
"@rizom/brain": patch
---

Studio collections that are still initializing end their wait with "Collections are not ready yet. Try again." even when the wait budget runs out as a response arrives, instead of surfacing the raw initializing error.
