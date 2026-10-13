---
"@rizom/brain": patch
---

A guest answer that fails no longer holds its place. When the model call returns an error, the answer settles as failed and is charged the $0.05 answer cap, so the visitor can ask again; an answer still active past its deadline (a process that died mid-answer) settles as interrupted at the cap on the next admission. Before, both stayed reserved for good, and three failed answers filled preview guest chat's concurrency so every later question was refused as busy.
