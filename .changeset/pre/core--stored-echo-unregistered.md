---
"@rizom/brain": patch
---

A restarted brain no longer logs `Failed to parse entity … no adapter registered` while directory-sync reconciles work an earlier Git broker left. A changed file of a type whose plugin has not registered yet is kept for the startup sync without reading its stored entity, and an import plan admits such a file only to create its entity instead of failing.
