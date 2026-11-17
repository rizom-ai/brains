---
"@rizom/brain": patch
---

`brain init --model <model>` keeps the model it is given: setup no longer asks for a chat provider or replaces the model, and asks only for the keys the brain's models need. A model whose key is missing, whether from flags or from the questions, stops init with the variable to set before anything is written.
