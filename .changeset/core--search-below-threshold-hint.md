---
"@rizom/brain": patch
---

`system_search` no longer returns a bare empty list when matches exist below `minScore`. It adds a `belowThreshold` block with the number of weaker matches the caller may see, the best score and a hint to search again with a lower `minScore`. Broad questions such as "What do you mostly write about?" match content weakly and used to fall under the default threshold, which led the agent to answer that no saved writing existed.
