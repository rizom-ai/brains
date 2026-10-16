---
"@rizom/brain": patch
---

Reads of non-public entities that relied on an unscoped lookup now pass a scope: a restricted artifact is withheld from callers who cannot see it instead of passing as missing; publishing a non-public post names why it is refused; reordering or restarting the publication queue keeps non-public queued posts; a redelivered email is not classified twice; note capture and markdown imports find their own private notes.
