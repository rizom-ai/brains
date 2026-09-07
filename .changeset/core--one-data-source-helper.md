---
"@brains/plugins": minor
"@brains/sdk": minor
---

One helper for a data source, with two forms

`defineDataSource` and `defineEntityDataSource` were two names for one concept.
Both produced the same declaration and bound to the same service; an author had
to know which name to reach for before knowing that.

`defineDataSource` now takes either form. A source that **fetches** reaches
somewhere the brain does not store and answers with what it found. A source
naming an **entity type** reads the brain's own records, and the runtime keeps
doing the paging, the sorting and the neighbour lookups rather than the author
writing them again over `fetch`.

The forms are exclusive in the type, so a declaration that is both, or neither,
matches neither overload. A runtime check remains for callers without types, and
says which of the two a declaration has to be.
