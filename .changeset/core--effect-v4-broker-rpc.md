---
"@brains/utils": patch
"@brains/directory-sync": patch
"@rizom/brain": patch
---

Replace the private Git broker transport with bounded Effect RPC over scoped Bun
socket adapters. Preserve strict operation validation, stable-ID replay,
broker-owned Git work through observer cancellation, and Promise-based public
contracts.
