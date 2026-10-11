---
"@rizom/brain": patch
---

Keep declarative agent cards current with their identity readers and public skills. A2A builds its card per request instead of retaining its first response, including skill edits, visibility withdrawal and deletion. Unavailable presentation still returns 503 without exposing local errors.

ATProto republishes on `system:identity:changed`, emitted after the local identity cache refresh completes, and on skill creation, update and deletion. Pending startup content uses `startupContentSettled`, after the scheduler refreshes imported identity; raw import completion does not authorize publication. Changes before boot publication are covered by that publication. Bursts share one waiting publish, with one fresh successor allowed behind in-flight work; shutdown drains admitted tasks and a failed attempt does not block later refreshes.

Identity singleton serialization now keeps authored frontmatter authoritative rather than overlaying stale projected metadata onto replacement content, preserving profile stories and extension fields. A real-app regression caught profile edits that otherwise republished the old name despite updating metadata. Existing mismatches are not automatically rewritten: reapply the intended full Markdown if an earlier edit was overwritten.

This retains full-boot and publishing-credential gates, public-skill filtering and installed ownership without restoring native plugin bridges. Signals are notifications, not cross-process identity synchronization or durable publication receipts. Coalescing is process-local, not a cross-process PDS transaction or a spending/duration bound.
