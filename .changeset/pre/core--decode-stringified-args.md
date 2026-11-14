---
"@rizom/brain": patch
---

A tool call whose arguments fail validation is read again with each object written as its JSON text decoded, so a local model's stringified nested object, such as system_create's source, no longer fails the call.
