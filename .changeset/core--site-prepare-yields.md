---
"@brains/site-builder-plugin": patch
---

Site builds give the event loop a turn between sections while preparing content. Local libSQL answers queries synchronously, so resolving every section ran as one unbroken chain and held up requests for the whole preparation; on the publishing app, the rebuild check after a content change blocked for 167 ms, and now for at most about 33 ms.
