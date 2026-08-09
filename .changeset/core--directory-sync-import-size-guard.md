---
"@rizom/brain": patch
---

Bound text and legacy binary directory imports with a configurable `maxImportFileBytes` limit (5 MiB by default), skip oversized files before reading or parsing them, and expose those skips as operational import issues without moving the source files.
