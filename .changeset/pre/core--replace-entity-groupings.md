---
"@brains/entity-service": patch
"@brains/plugins": patch
"@brains/studio": patch
"@rizom/brain": patch
---

Add atomic replacement of an entity registry's complete grouping set through `replaceGroupings`. Grouping-owned schema extensions are kept separate from permanent plugin extensions, so removing a grouping preserves owner/plugin fields and their refinements. Invalid replacements leave the active set unchanged; authored memberships and file identities are never rewritten.

`validateGroupings` now preflights a complete replacement set. Studio's existing registration path includes already-registered declarations in that preflight. These registry primitives do not load a definitions document, coordinate readiness or automatically reproject stored content; their caller still owns those steps.
