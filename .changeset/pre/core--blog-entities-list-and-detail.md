---
"@rizom/brain": patch
---

`blog:entities` no longer answers a `latest` query or a `metadata.seriesName` query: nothing sends either. It still serves paged post lists, and a post by its slug with its neighbors and the other posts in its series. The series page reads its posts through the series package.
