---
"@rizom/brain": patch
---

Directory sync no longer re-imports the brain's own exports. Auto-sync commits what the brain writes, and the next periodic pull listed those files as changed and queued an import job for each, which could only skip. Changed markdown files whose content already matches their stored entity are now left out of the pull's import batch; a pull whose changes are all such echoes queues nothing and still advances its checkpoint.
