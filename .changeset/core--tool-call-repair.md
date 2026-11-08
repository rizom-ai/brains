---
"@rizom/brain": patch
---

A tool call whose arguments fail validation is repaired by the model that made it: its arguments are generated again with the tool's input schema constraining the output, so misplaced fields or malformed JSON cost one constrained call instead of a retry the model may abandon. A failed repair leaves the retry as before.
