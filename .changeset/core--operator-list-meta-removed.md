---
"@rizom/brain": patch
---

Operator-view list rows no longer accept the deprecated `meta` field; give a row's detail lines as `metadata: [text]`. A Studio workspace or Dashboard widget that still sends `meta` is refused with a validation error naming the field.
