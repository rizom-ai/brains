---
"@brains/webdav": patch
"@brains/entity-placement": patch
"@brains/auth-service": patch
"@brains/directory-sync": patch
"@brains/studio": patch
"@brains/plugins": patch
"@brains/contracts": patch
"@rizom/brain": patch
---

A brain can be mounted as a read-only network drive. The new opt-in `webdav` plugin (`add: [webdav]`) serves the brain's entities over WebDAV on `/dav`, as the folders and files `brain-data/` holds, at the visibility of the person signed in: anything they may not see is not listed and answers 404. A mount signs in with an app password, created in Studio under Account → Drive: a generated username and password shown once, read-only, valid for the drive only, expiring after a year, revocable, and refused over plain HTTP except on localhost. The tab shows the drive address and the steps for GNOME Files and rclone. Web routes may now declare `HEAD` and the WebDAV methods, and entity file placement moved from directory-sync into the shared `@brains/entity-placement` package with no change to any path.
