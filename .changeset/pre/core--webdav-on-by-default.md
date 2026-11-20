---
"@rizom/brain": patch
---

The WebDAV drive is on by default. `webdav` is now a member of the `web` bundle, so every brain that serves HTTP can be mounted as a network drive on `/dav`, signed in with an app password from Studio under Account → Drive; `add: [webdav]` is no longer needed and `remove: [webdav]` turns the drive off. A brain without `web` (the headless recipe) has no drive, as it has no HTTP listener and no app passwords. App passwords stay as they were: read-only unless saving is allowed when one is created, valid for the drive only, expiring after a year, and refused over plain HTTP except on localhost.
