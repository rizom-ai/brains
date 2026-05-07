---
"@rizom/ops": patch
---

Move the `@rizom/ops` packed-tarball smoke test out of per-commit CI into the Release workflow's pre-publish step. The test (build + npm pack + bun add + multiple CLI subprocess invocations) was hitting the 20s default timeout on congested runners and blocking unrelated changes from publishing. It now runs only when `RUN_SMOKE_TESTS=1` is set, gated to the actual publish step where its end-to-end "the published artifact works for external consumers" guarantee is most valuable.
