---
"@brains/core": patch
---

The system_update replacement preview bounds its line diff by a fixed number of changed lines instead of a 100 ms clock, so the same replacement previews the same way on a loaded machine; the omitted-diff note names the bound.
