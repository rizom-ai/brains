---
"@rizom/brain": patch
---

Studio's editor shows an action item the way the board does. Assigned To lists people by name and adds them from the brain's members; Requested By names who added the card. Where a card came from (origin, channel, source, capture time) shows as read-only facts and disappears when empty, the body hash is no longer on the form, and the page is headed by the card's text instead of its id. Entity adapters can now name an entry for display with an optional `displayTitle`, and schemas can mark fields for Studio with `studioWidget` metadata (`members`, `people`, `provenance`, `hidden`).
