---
"@rizom/brain": patch
---

An eval's resultContains judges the tool calls that took effect: a call the tool refused, which changed nothing, no longer fails a turn whose retry returns the expected result. A turn still needs one call that took effect, and each must return the expected result.
