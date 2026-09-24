---
"@brains/db": patch
---

Enforce the existing 64 KiB metadata allowance across HTTP request and completion envelopes, including escaped UTF-8 fields and framing. Reject oversized requests before admission or source access; validate completions in the native actor before emission and independently in the owner. Reject projection amplification without replay or invented completion evidence.
