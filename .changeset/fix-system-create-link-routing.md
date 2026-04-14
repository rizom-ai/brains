---
"@rizom/brain": patch
---

Fix `system_create` for `link` entities so URL-based link requests enqueue the correct `link-capture` job, raw URL content routes through capture, and direct creation only succeeds for valid full link markdown/frontmatter.

Also register the stable `link-capture` handler alias in the link plugin so core can stay generic and link capture jobs do not fail with `No handler registered for job type: link-capture`.

Add regression coverage for link creation routing and link handler registration so future releases catch mismatches between `system_create`, link job names, and link capture behavior.
