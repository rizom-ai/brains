---
"@brains/contracts": patch
"@brains/social-media": patch
"@brains/content-pipeline": patch
---

Share the bounded upload-recovery wire schema and preserve validated diagnostics through content-pipeline failure broadcasts and callbacks. Failure reporting now returns a joined promise, preserves independent sink failures, and does not replay callbacks or publishing operations. Malformed recovery is rejected before accounting or broadcast; diagnostics remain distinct from a durable recovery journal.
