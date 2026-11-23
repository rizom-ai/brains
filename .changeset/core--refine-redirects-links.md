---
"@rizom/brain": patch
---

Refining notes no longer leaves links pointing nowhere. A refined note removes the notes it was written from, and a `[[note-id]]` link to one of them in another entry kept pointing at a note that was gone. Links to a removed source, bare, with a label or to a heading, now point at the refined note, in every entry its requester may see and update.
