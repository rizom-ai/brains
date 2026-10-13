---
"@rizom/brain": patch
---

Keep Git authoritative for durable entities by deleting database rows that have no valid or quarantined source file, exporting scheduler projection writes through normal entity lifecycle events, preserving projection provenance across unchanged imports, and preventing skill derivation from deleting or overwriting authored skills.
