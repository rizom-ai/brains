---
"@brains/entity-service": patch
"@brains/plugins": patch
"@brains/studio": patch
"@brains/utils": patch
"@rizom/brain": patch
---

Add read-only grouping-source refresh hooks before persistence, projection and grouping-dependent reads, and provide Studio's document-backed definitions contract with independent cardinality and list validation. Refresh failures refuse operations rather than use stale policy; uncached frontmatter parsing keeps repeated malformed-document reads repairable.

These hooks underpin Studio's document-owned groupings and process-local reprojection readiness. The old configured groupings are used only on the smoke test site. Its test setup will use the new document directly; no legacy converter or automatic conversion is introduced.
