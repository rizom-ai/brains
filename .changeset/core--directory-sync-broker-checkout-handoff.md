---
"@brains/directory-sync": patch
"@rizom/brain": patch
"@brains/core": patch
"@brains/plugins": patch
"@brains/app": patch
---

Hand the Git broker's absolute checkout path to every app role alongside its socket.

Directory Sync now uses the broker-owned path instead of resolving a relative shell data directory again in another process. This prevents development and supervised runtimes from failing plugin initialization with `This broker owns no checkout` when their process working directories differ.
