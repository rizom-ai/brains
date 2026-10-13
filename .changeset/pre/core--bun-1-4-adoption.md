---
"@brains/app": patch
"@brains/chat-repl": patch
"@brains/db": patch
"@brains/deploy-support": patch
"@brains/media-renderer": patch
"@brains/site-engine": patch
"@rizom/brain": patch
---

Adopt Bun 1.4 across the runtime and published brain package. Replace Sharp image optimization with `Bun.Image`, replace Playwright media rendering with `Bun.WebView`, enable measured test parallelism, make time-based tests deterministic, and apply SQLite busy timeouts before contended WAL initialization.
