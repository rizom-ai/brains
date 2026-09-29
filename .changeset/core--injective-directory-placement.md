---
"@brains/directory-sync": patch
"@brains/contracts": patch
"@brains/studio": patch
---

Make valid entity export paths injective: retain type-prefixed ID segments and limit exported notes to one segment at the sync root. Refuse historical invalid placements before file writes, deletion, or cleanup, and retain placement diagnostics independently of successful exports. Studio previews the placement verdict, refuses explicitly invalid destinations, and keeps note creation flat. Collection rows without an authored title display their structured leaf segment while preserving full stored IDs for links and identity details.

Existing IDs are not rewritten and existing files are not moved or migrated. Files created under the previous prefix-stripping or nested-note conventions require operator review.
