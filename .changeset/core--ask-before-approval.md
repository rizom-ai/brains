---
"@brains/entity-service": patch
"@brains/plugins": patch
"@brains/core": patch
"@brains/portfolio": patch
"@brains/decks": patch
"@brains/doc": patch
"@brains/blog": patch
"@rizom/brain": patch
---

Saving pasted text as a portfolio project, a deck, a doc or a post now asks for a missing year, section, title or slide break before the brain asks you to approve the save, in plain words. You answer, then approve once, and the approval shows the complete save: the title and the description, year or section the brain filled in. Approving no longer ends in "Failed: Create" with instructions meant for the agent, and you no longer approve twice. Entity plugins check a create before it is confirmed by overriding `checkCreate`.
