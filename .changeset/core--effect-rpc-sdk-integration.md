---
"@brains/core": patch
"@brains/plugins": patch
"@brains/utils": patch
"@brains/directory-sync": patch
"@rizom/brain": patch
---

Integrate the exact-pinned Effect v4 runtime and private bounded broker RPC transport while keeping Effect out of public authoring declarations. Preserve installed capabilities, scoped mirror access, public error boundaries, independent service lifetimes and the lifecycle-owned startup continuation, including failed-import default guards.

Keep the existing provider-free built-runtime worker export fixture; the incoming test-only provider removal is already satisfied without changing public declarations. Read its recovery checkpoint from the installed package's state namespace, and isolate fixture installation and cleanup by test process. Broker wire v2 has no legacy fallback: stop the old broker and its web/worker roles before replacing the cohort. Transport observer cancellation does not cancel admitted Git operations or permit replay against a replacement owner.
