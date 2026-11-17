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

A brain can be mounted as a network drive. The new opt-in `webdav` plugin (`add: [webdav]`) serves the brain's entities over WebDAV on `/dav`, as the folders and files `brain-data/` holds, at the visibility of the person signed in: anything they may not see is not listed and answers 404. A mount signs in with an app password, created in Studio under Account → Drive: a generated username and password shown once, read-only unless saving is allowed when it is created, valid for the drive only, expiring after a year, revocable, and refused over plain HTTP except on localhost. Saving, creating and deleting a markdown file through the drive go through the type's validation, the entity action and visibility policies and a stale-write check, as a Studio edit does; editors' temporary files and new empty folders are held per person in memory and never become entities. Renaming files and saving images or documents are not offered yet. The tab shows the drive address and the steps for GNOME Files and rclone. Web routes may now declare `HEAD` and the WebDAV methods, and entity file placement moved from directory-sync into the shared `@brains/entity-placement` package with no change to any path.
