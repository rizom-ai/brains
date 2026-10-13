---
"@brains/auth-service": patch
"@rizom/brain": patch
---

Publish first-Anchor setup tokens only after persistence succeeds. Serialize token lookup, rotation, consumption, and clearing so concurrent requests cannot expose unpersisted tokens or let pending creation undo setup-state clearing.
