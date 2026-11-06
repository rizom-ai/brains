---
"@rizom/brain": patch
"@brains/entity-service": patch
---

`brain assets:reconcile [--from brain-data] [--dry-run]` rebuilds image rows and assets from the synced content while the app is stopped. An image file with no row becomes a row with its asset, a reference whose asset was lost gets its bytes back, and an inline row whose stored bytes were lost (malformed or double-encoded) is restored from its file; each happens in one transaction with its bytes. When an image has several files, the first that holds a supported image is used and the unreadable ones are listed. A reference that disagrees with its file is reported and never changed, and a reference with neither its asset nor a file fails the run.
