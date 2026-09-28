---
"@brains/core": patch
---

Keep file runtimes and their persistence endpoints alive through plugin shutdown so final native exports can finish before actors, endpoints, and databases retire.
