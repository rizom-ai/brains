---
"@brains/webdav": patch
---

The drive answers a sync client as it is: a request that names itself one (`X-Brain-Sync: 1`) sees every type's folder, empty or not, gets the stored version's ETag after a save with whether it was stored as sent or in another form, and is never shown a held save. With `X-Brain-Keep: conflict`, a save that loses to a newer version, or a new file whose name is taken, is kept as a conflict and named in `X-Brain-Conflict`. Desktop mounts are answered as before.
