---
"@brains/ai-evaluation": patch
---

A multi-model evaluation where a model ran no tests now fails, as a single-model run already did. A test filter that matched nothing previously reported success while verifying nothing.
