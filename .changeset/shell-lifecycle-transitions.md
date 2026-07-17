---
"@brains/core": patch
"@brains/plugins": patch
"@brains/recurring-checks": patch
---

Make shell, daemon, and plugin teardown transitions joinable and terminal; stop active agent work before plugin teardown; and drain plugin-owned recurring checks before shutdown returns.
