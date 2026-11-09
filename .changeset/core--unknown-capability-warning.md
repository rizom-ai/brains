---
"@rizom/brain": patch
---

A brain.yaml `add` or `remove` entry that names no capability or interface of the brain is still ignored, so a brain that names a retired capability keeps booting, but the brain now logs a warning naming the entry and the capabilities and interfaces it knows, so a typo or a capability a release folded away no longer goes unnoticed.
