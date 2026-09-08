---
"@brains/sdk": minor
---

The entity authoring entry stops handing out general-purpose helpers

`@rizom/brain/entities` re-exported `pLimit`, `getErrorMessage`, `slugify`,
`slugifyUrl` and `truncateText`. They are useful, which is not the same as being
Brain authoring concepts, and three of them had no consumer through this entry
at all — every package already imported them from the shared library directly.

They are gone from the entry. The packages that took `slugify` or `truncateText`
from it now name `@brains/utils/string-utils`, which is where they live and what
the rest of the repository already writes.
