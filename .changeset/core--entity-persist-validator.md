---
"@rizom/brain": patch
---

A first-party entity type checks a write against the record's id as its class did, so the form type still refuses a form whose id is not a slug once it converts.
