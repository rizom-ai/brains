---
"@rizom/brain": patch
---

Harden site build status against lost writes: reconcile from the queue's recent jobs even when no lifecycle write ever landed, restore in-flight builds to the projection, clear active entries for jobs the queue no longer knows, report the published generation from one shared schema, and derive dashboard state, detail, and tone from a single precedence walk so retained failures can never masquerade as the current attempt.
