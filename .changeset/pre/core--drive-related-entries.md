---
"@brains/webdav": minor
"@rizom/brain": minor
---

A sync client can ask the drive which entries are nearest to one.

- `GET /dav/.brain/related?path=<file>&limit=<n>`, for sync clients (`X-Brain-Sync: 1`): the entries with text nearest the entry at that path, closest first, as the asker may see them, each as its file on the drive with its title, type and distance. At most twenty-five, ten when not said.
- A path that names no entry the asker may see has none. A brain that keeps no index of meaning answers `indexed: false`.
- The Rizom Brain plugin for Obsidian shows them in a side panel beside the open note.
