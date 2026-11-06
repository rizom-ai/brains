---
"@rizom/brain": patch
---

Searching a large brain no longer freezes its worker. Search ranked each candidate's keyword match with a full-text query run once per entity, three seconds on a book corpus and long enough on a small server to miss the worker's heartbeats, so builds were killed and retried and Studio's build buttons stayed locked; the matches are now found once per search.
