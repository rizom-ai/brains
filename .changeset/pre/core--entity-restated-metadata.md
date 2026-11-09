---
"@rizom/brain": patch
---

A first-party entity type whose stored document states more than its metadata did, such as a slug resolved from the title, now stores its metadata as that document states it. Later writes then read what the file says, as the entity plugin classes did.
