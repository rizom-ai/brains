---
"@rizom/brain": patch
---

Site builds collect declarative layout slots in workers through the narrow, scoped `siteContributions.withSlots` reader, so configured newsletter signup forms reach built footers without ready-phase announcements. The host assigns ownership and expires render handles at the end of each build callback. Static HTML snapshots drive both fingerprinting and page output, so changed or removed slots invalidate cached builds. Malformed or failed contributions reject instead of silently disappearing. Layout slot readers now enumerate names with `getSlotNames()`; no generic collector or mutable registry is exposed.
