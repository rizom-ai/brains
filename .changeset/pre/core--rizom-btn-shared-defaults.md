---
"@brains/theme-rizom": patch
---

Drop the 23 `--rizom-btn-*` declarations that `@rizom/theme-default` (which
this theme composes at runtime) now declares as shared defaults; only this
theme's genuine deltas remain.
