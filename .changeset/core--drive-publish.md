---
"@brains/contracts": minor
"@brains/content-pipeline": minor
"@brains/webdav": minor
"@rizom/brain": minor
---

A sync client's person can publish an entry from their notes app.

- `publish:request` in `@brains/contracts`: publish one entry now, as a person. The publishing pipeline answers it with what its publish action does once confirmed: the person must hold the publish permission, the entry must be public, complete and not yet published, and its provider publishes it. Why not, when not, is passed on.
- `POST /dav/.brain/publish` with `{ "path": "<file>" }`, for sync clients with an app password that may save: the drive names the entry the file is and sends that request. It is the only thing a POST does on the drive, and WebDAV clients are not told of it.
- The Rizom Brain plugin for Obsidian has a "Publish this entry" command that uses it.
