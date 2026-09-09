---
"@brains/build-tools": patch
"@brains/web-chat": patch
"@brains/studio": patch
"@rizom/brain": patch
---

Build web-chat UI assets in a private sibling directory, then atomically replace each completed file. Concurrent readers no longer observe bundles truncated by an overlapping CLI build. Failed compilation leaves the previous assets intact, and source-map paths retain their original base.

Build bundled web-chat and Studio assets into CLI-owned staging directories instead of rewriting dependency-owned outputs during their tests. Both build scripts accept a separate output directory; custom destinations are not cleaned destructively. CLI staging is outside published dist and cleaned on process exit.

Add deterministic open-file, compilation-failure, staging-cleanup, and private-output regression coverage. Publication is atomic per file, not a transaction across the complete UI asset set.
