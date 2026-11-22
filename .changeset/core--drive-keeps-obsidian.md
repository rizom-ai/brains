---
"@brains/contracts": patch
"@brains/core": patch
"@brains/directory-sync": patch
"@brains/entity-service": patch
"@brains/plugins": patch
"@brains/sdk": patch
"@brains/webdav": patch
"@rizom/brain": patch
---

A brain mounted as a drive and opened as an Obsidian vault keeps the vault's settings. Obsidian's `.obsidian` folder was a temporary item like any other hidden folder, gone ten minutes after its last use and on every restart, so the vault forgot its open tabs, settings and plugins. It is now stored per person with the brain's runtime state, 32 MiB at most, and is there after a restart and from that person's other devices. Other hidden folders stay temporary.

Renaming a note's file on the drive renames the note. The brain had no rename: a file name was an id fixed at creation, and the drive refused the request, which left a mount showing a name the brain did not have. A note is now renamed in one step that keeps its text, metadata, visibility, creation date and embedding, announced as `entity:renamed` rather than as a delete and a create. Its file in `brain-data/` moves with it. Other types keep their names.
