---
"@brains/plugins": patch
"@rizom/brain": patch
---

A service answers only channels its owner names: `<package name>:<name>`, the same owner its runtime state is kept under. Answering any other channel is refused when the package registers; declaring a contract and asking one stay open, since an asker imports the owner's contract.
