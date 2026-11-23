---
"@rizom/brain": patch
---

Renaming a note through `system_update` reaches its file. A note's title set through fields changed the database only: the note's file states a title only when one was stated, so the file kept none, and the next import from git took the title from the body's heading again. A field update of a declared type read as its body is now applied to the file as the type stores it and read back, so a title set this way is stated and written.
