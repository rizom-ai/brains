---
"@brains/topics": patch
---

Decouple the deprecated `sourceWeights` and `mintableEntityTypes` config
fields. Setting only `sourceWeights` no longer switches minting onto an
empty legacy allow-list (which silently disabled topic creation); each
legacy field now overrides only its own dimension, with role policies
covering the rest.
