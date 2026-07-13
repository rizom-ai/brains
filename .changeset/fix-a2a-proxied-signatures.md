---
"@brains/a2a": patch
"@rizom/brain": patch
---

Fix A2A request signing across local and deployed instances. Local callers no longer send signatures with unreachable loopback key URLs, while deployed receivers verify signatures against the public forwarded URL instead of their internal reverse-proxy URL.
