---
"@rizom/brain": patch
---

Books and their sections are two entity types: `book` is the work, with its details and contents, at `book/<slug>.md`; `book-section` is its text, at `book-section/<slug>/…`. Entity counts, search scopes and Studio now read 26 books and 3,705 sections instead of counting every section as a book. Answers cite sections only; a book's contents are never a source. The corpus reader reads back each part of a book printed in parts, so a corpus can be re-rendered without fetching its source.
