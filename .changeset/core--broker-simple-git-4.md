---
"@rizom/brain": patch
---

Migrate the Git broker to Simple Git 4.0.2's named export and updated argument parser. Retain broker ownership, invocation-local hook disabling, credential handling and existing unsafe-option policy. Add regressions for explicit configuration includes, trailer commands, abbreviated executable options and VISUAL editors, alongside ordinary managed operations.

This does not broaden the broker's operation surface or certify all Git configuration, native Git subprocesses or other dependencies as safe. Other dependency updates remain separate.
