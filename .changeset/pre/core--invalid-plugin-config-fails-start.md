---
"@rizom/brain": patch
---

A plugin whose configuration is wrong — an unknown key or a value of the wrong type — now stops the brain from starting with the validation message, instead of being dropped without a trace. A plugin is still skipped when its only problem is a required value that is not set, such as a credential whose environment variable is absent.
