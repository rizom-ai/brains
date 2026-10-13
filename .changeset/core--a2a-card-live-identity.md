---
"@rizom/brain": patch
---

Keep both published agent cards current with the brain's identity and skills. The A2A Agent Card is built per request, so a brain whose anchor profile, character or skills landed after startup no longer advertises "Brain is Unknown's Knowledge assistant" until restart. The AT Protocol brain card republishes on a new `system:identity:changed` signal, sent once the identity caches hold the change, and on skill creation, update and deletion; bursts of changes coalesce into one republish, and changes before the boot publish are covered by it.
