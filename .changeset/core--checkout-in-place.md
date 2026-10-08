---
"@rizom/brain": patch
---

A new brain whose content repo already has history now checks it out in place: the data directory is a mount point in a deployed brain, and the old clone-then-rename failed there silently, falling back to a local repository merged with the remote as an unrelated history. A Git command whose output passes the retention ceiling now runs to completion instead of being killed, which had failed the startup sync of large repositories. After a failed startup sync no identity or prompt defaults are created, so they can no longer be exported over content the sync never imported.
