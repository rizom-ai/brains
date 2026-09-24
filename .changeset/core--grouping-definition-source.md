---
"@brains/entity-service": patch
"@brains/plugins": patch
"@brains/studio": patch
"@brains/utils": patch
"@rizom/brain": patch
---

Add read-only grouping-source refresh hooks before persistence, projection and grouping-dependent reads, and prepare Studio's document-backed definitions contract with independent cardinality and list validation. Refresh failures refuse operations rather than use stale policy; uncached frontmatter parsing keeps repeated malformed-document reads repairable.

This is an internal foundation checkpoint. Studio activation, post-save reprojection/readiness coordination, replacement controls and the explicit smoke conversion remain pending; existing Studio configuration is unchanged.
