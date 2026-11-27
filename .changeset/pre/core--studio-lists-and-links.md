---
"@brains/studio": minor
"@brains/plugins": minor
"@brains/blog": patch
"@brains/decks": patch
"@brains/portfolio": patch
"@brains/social-media": patch
"@brains/link": patch
"@brains/doc": patch
"@brains/guide": patch
"@brains/note": patch
"@rizom/brain": minor
---

Studio's lists say more about each entry:

- A row states its entry's own status (Draft, Queued, Published) and its meaningful date. That is the day it was published, or when it was last edited ("Edited 2 days ago"), not the import time.
- A row shows its entry's excerpt and, for types with covers, a cover thumbnail. Thumbnails are served at 160px, so a page of rows never loads full images.
- A Compact toggle lists one line per entry. The choice is kept in this browser.
- Prompts, Skills and Agents use the same row as the Library.
- A schema names the fields a row shows with `.meta({ studioColumn: "date" | "excerpt" })`. Covers come from the adapter's cover support, read through the new `hasCoverImage` entity shape.
- The Library has an Images page. It is a grid of the brain's images, each marked when it has no alt text. Opening one shows its title and alt text to edit, and the entries that use it. Images can be uploaded there.
- A note whose body starts with `# Untitled` is named by the prose under it.
