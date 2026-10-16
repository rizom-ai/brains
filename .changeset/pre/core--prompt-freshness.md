---
"@rizom/brain": patch
---

Prompt copies follow their defaults. Each prompt the brain writes into `prompt/` now records the hash of the default it was written from (`defaultHash`). At startup an untouched copy is replaced when its default changes, so improvements to built-in prompts reach existing brains; an edited copy is kept and logged once its default has moved. Copies from before this change are stamped when they still equal the default and otherwise kept and logged as unverified overrides; delete one to restore its default. Copies are now stored under the template key generation reads, and stale copies written under a template's short name are removed.
