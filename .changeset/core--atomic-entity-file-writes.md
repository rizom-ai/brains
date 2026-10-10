---
"@brains/directory-sync": patch
---

Directory sync writes entity files, document sidecars, and image-conversion rewrites through a temporary dotfile beside the target and renames it into place. Before, a new file existed before its content landed, so the file watcher, the import scan, or a concurrent Git commit could read an empty or partial note. The checkout's local Git exclude keeps in-flight temporary files out of commits; the content repository itself is unchanged.
