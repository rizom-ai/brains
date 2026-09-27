---
"@brains/entity-service": patch
"@brains/plugins": patch
"@brains/studio": patch
"@brains/utils": patch
"@rizom/brain": patch
---

Add read-only grouping-source refresh hooks before persistence, projection and grouping-dependent reads, and provide Studio's document-backed definitions contract with independent cardinality and list validation. Refresh failures refuse operations rather than use stale policy; uncached frontmatter parsing keeps repeated malformed-document reads repairable.

These hooks underpin Studio's document-owned groupings and process-local reprojection readiness. Existing configured groupings require a separately reviewed, fenced one-time conversion before upgrading; no automatic conversion is performed.
