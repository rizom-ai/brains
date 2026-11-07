---
"@brains/plugins": patch
---

The test entity registry refuses a second registration of an entity type, as the brain's registry does, so a package declaring a type another package already owns fails in tests as it does in a brain.
