---
"@rizom/brain": patch
---

Use the shell returned by the in-process booted app when invoking built-in CLI tools so installed-package site builds run against the initialized brain instead of a fresh singleton shell.
