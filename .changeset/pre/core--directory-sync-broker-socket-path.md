---
"@rizom/brain": patch
---

A Brain whose instance directory is too deep for a unix socket address can start again. The Git broker socket normally lives in the instance's `.brain-runtime`; when that path exceeds the kernel's limit, the socket now lives in the OS temp dir under a name derived from the instance, so it stays one socket per instance and never inside a checkout. Before, such a Brain refused to boot with "Git broker socket path is too long for a unix socket".
