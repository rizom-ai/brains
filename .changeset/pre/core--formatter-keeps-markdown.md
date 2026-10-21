---
"@rizom/brain": patch
---

Structured entity bodies keep their markdown. Reading a section used to rebuild its text from plain words, emphasis and strong only, so links, inline code, code blocks, quotes and headings inside a field were lost on the next save. A section now reads back exactly as written, list items included, and a custom field parser receives the section's markdown.
