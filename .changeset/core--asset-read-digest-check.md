---
"@brains/entity-service": patch
---

Reading a stored asset checks its digest. Bytes that no longer hash to their reference fail with an asset integrity error, and a streamed read withholds its final chunk, so a download of a corrupt image fails instead of completing with the wrong bytes. Verification still reports a mismatch without refusing the read.
