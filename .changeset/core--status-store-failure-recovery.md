---
"@rizom/brain": patch
---

Keep serialized status mutations isolated from the committed cache until persistence succeeds. Rejected callbacks, invalid drafts and failed writes no longer poison later updates; retained drafts/results cannot mutate committed state. Evict failed initial reads so repaired or recovered storage can be read again without recreating the service. Preserve successful read caching, per-instance serialization and existing schema/wire behavior, with native and packed-consumer recovery coverage.
