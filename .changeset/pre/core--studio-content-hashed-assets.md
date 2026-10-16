---
"@brains/studio": patch
"@rizom/brain": patch
---

Use manifest-selected, content-hashed Studio JavaScript and CSS entry URLs so browser caching cannot mask new releases. Keep authenticated shells uncached, serve immutable public assets only from the validated manifest, and offer explicit draft-loss confirmation rather than automatically reloading when an Account or Chat chunk cannot load.
