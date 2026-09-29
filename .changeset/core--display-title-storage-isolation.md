---
"@rizom/brain": patch
"@brains/sdk": patch
"@brains/plugins": patch
"@brains/entity-service": patch
---

Keep declarative display-title projections separate from metadata extraction.
UI labels no longer overwrite canonical titles during entity creation or update;
serialization never invokes presentation callbacks. Studio still uses the
adapter-owned label, including Note's body fallback and migrated metadata.

Cover SQLite reopen/update behavior and public SDK harness roundtrips through
source, built exports, and isolated packed consumers.
