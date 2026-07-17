---
"@brains/core": patch
---

Make shell boot, shutdown, and per-daemon transitions joinable and terminal, and stop active agent work before draining jobs and tearing down plugins.
