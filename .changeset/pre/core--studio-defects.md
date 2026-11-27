---
"@brains/studio": patch
"@brains/console-theme": patch
"@brains/unified-inbox": patch
"@brains/topics": patch
"@rizom/brain": patch
---

Studio fixes from the UX review:

- Library rows, group members and navigation destinations are links, so they open in a new tab, middle-click and copy like any other link; a plain click still navigates in place.
- The browser tab names the open page, such as "Event Sourcing for Sustainability Metrics — Posts — Alex Chen", instead of "Content Studio" everywhere.
- Studio follows the system color scheme until a climate is chosen. The Dashboard and the guest Ask page keep their own.
- Overview's activity survives a restart and names entries by their title. Topics now name themselves by their header's title everywhere, including ⌘K.
- A note body's leftover frontmatter previews as YAML instead of a large heading.
- An unfiltered empty Inbox no longer blames its filters, the first Groupings visit no longer asks for types, and the save state and why it cannot save no longer run together.
