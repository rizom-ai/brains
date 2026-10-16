---
"@rizom/brain": patch
---

Remove the singleton accessors from every shell-owned service. Services are constructed by the shell's layer graph and handed to their consumers, so `getInstance`, `resetInstance`, and `static instance` carried process-global state that outlived shutdown for no benefit. `EntityService` now requires the `entityRegistry` option instead of silently reaching for a global registry, and `brain operate` reports a boot that returns no brain rather than falling back to a global shell.
