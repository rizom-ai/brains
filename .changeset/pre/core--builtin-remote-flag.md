---
"@rizom/brain": patch
---

Built-in commands such as `brain tool` now refuse `--remote` instead of ignoring it and booting a local brain against the same data. Remote mode applies to the brain's own commands, e.g. `brain build-site preview --remote <url>`.
