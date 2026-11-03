---
"@rizom/brain": patch
---

A Git checkout behind a symlinked folder keeps one identity before and after it is created. Before, the Git broker named a checkout that did not exist yet by its unresolved path, then refused the same checkout once it existed, because it then resolved to a different path. This happened, for example, on macOS, where the temp folder sits behind a symlink.
