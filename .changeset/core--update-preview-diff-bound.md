---
"@rizom/brain": patch
---

Bound `system_update` replacement previews by 400 added plus removed lines instead of a 100 ms clock, so identical replacements do not receive different previews under machine load. Larger diffs report the explicit edit limit. Field previews, confirmation, caller authorization and revision checks are unchanged. This is not a bound on input bytes, total scans, elapsed time or memory.
