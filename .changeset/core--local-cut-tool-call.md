---
"@rizom/brain": patch
---

A local model whose tool call is cut off by the thinking limit is now asked again without the limit. Before, a long call, such as an edit that restates a whole note, failed three times and the request ended in an error.
