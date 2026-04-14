---
"@rizom/brain": patch
---

Fix `system_create` for `link` entities so URL-based link requests enqueue the correct `link-capture` job, raw URL content routes through capture, and direct creation only succeeds for valid full link markdown/frontmatter.

Also add regression coverage for link creation routing and link-related eval fixtures so future releases catch mismatches between `system_create`, link job names, and link capture behavior.
