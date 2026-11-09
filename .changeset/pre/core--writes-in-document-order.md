---
"@rizom/brain": patch
---

A first-party entity type whose files people write by hand can keep each file's own frontmatter order. Written values land where the file has them, a nested value it writes unchanged keeps the file's key order, and a field the file lacks follows the rest, so directory sync leaves a file it only read as it was.
