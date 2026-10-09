---
"@brains/book": patch
"@brains/book-import": patch
"@brains/db": patch
"@rizom/brain": patch
---

Integrate multi-part books and refused-write durability while preserving declarative Book codecs and scoped presentation readers. Book entries record ordered heading paths; the offline corpus reader can restructure previously imported sections without another network fetch. Preserve safe output paths and staged per-book replacement with rollback; stop readers and writers for restructuring, which is not a whole-corpus or crash-atomic migration.

Read parts sequentially and stop after a failed read, before replacing that book. Reject duplicate source sigla in an offline corpus instead of silently selecting an arbitrary book. Refused standalone SQLite statements reopen their local connection so later successful writes are actually committed, while retaining one contention budget and never replaying transaction bodies.
