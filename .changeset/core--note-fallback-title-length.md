---
"@rizom/brain": patch
---

Cap first-line note title fallbacks at 80 characters including an ellipsis, preferring word boundaries and avoiding split Unicode surrogate pairs. Preserve authored titles, H1 headings, meaningful stored metadata titles, and exact note content. Stored Untitled placeholders use the same capped adapter projection without read-side writes.
