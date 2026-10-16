---
"@brains/atproto-contracts": patch
---

Preserve defs.main.description when parsing canonical lexicons. zod strips
undeclared keys, so the registry published all nine ai.rizom.brain.* lexicons
shorn of their authored descriptions.
