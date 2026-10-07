---
"@brains/plugins": patch
"@brains/sdk": patch
"@rizom/brain": patch
---

Expose the author's original thrown value as `cause` on public testing-harness tool failures, alongside the unchanged sanitized `error` and `code`. Preserve per-call identity without placing diagnostics on production response objects or wire payloads. Verify that single-attempt job rejections retain the same diagnostic cause and document how a failing test can show it.
