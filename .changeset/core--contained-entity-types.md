---
"@rizom/brain": patch
---

An entity type can be contained in another: a book's sections live in the book's own folder (`book/<slug>.md` beside `book/<slug>/`), are deleted with their book, and appear inside Books in Studio rather than as a separate collection. Each book is a folder titled by the book; opening one shows the book's record first, then its sections. Contained ids start with their container's id, and a container's ids stay flat.
