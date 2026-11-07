---
"@brains/plugins": patch
"@rizom/brain": patch
---

A service acting as itself, with no caller (an answer, a job it queued for itself, other slot work), reads and writes its own types as a class plugin does: at every visibility and past the action policy, which governs callers. Other types it reads at its own grant. Writes by a tool caller, a route caller or a job a requester queued stay held to the policy at that caller's level. A steward therefore writes its own type with no grant from the brain.
