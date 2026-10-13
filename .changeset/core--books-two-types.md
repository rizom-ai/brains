---
"@rizom/brain": patch
---

Books and their sections are two entity types: `book` is the work, with its details and contents, at `book/<slug>.md`; `book-section` is its text, at `book-section/<slug>/…`. Entity counts, search scopes and Studio distinguish books from sections instead of counting every section as a book. Answers cite sections only; a book's contents are never a source. Both types use declarative entities with read-only action policies. The corpus reader reads back each part of a book printed in parts in the new layout, so that corpus can be re-rendered without fetching its source.

The importer stages both output paths and rolls back failed publication, retaining backups if recovery fails. Replacement requires stopped readers and exclusive writer access; it is not filesystem-wide, whole-corpus or crash atomic. No live content migration, dual-format runtime support, release or deployment is performed.
