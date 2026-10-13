---
"@rizom/brain": patch
---

The `topic-distribution` insight no longer returns a bare empty list when no topics exist yet but there is content to extract them from. It adds `unextracted` with the number of visible source entities and a hint to answer from `system_search`. Topics are extracted in the background, so right after content arrives the empty list read as "nothing written", and the agent told the owner there was not enough content.
