---
"@brains/webdav": patch
"@rizom/brain": patch
---

A brain mounted as a drive and opened as an Obsidian vault keeps the vault's settings. Obsidian's `.obsidian` folder was a temporary item like any other hidden folder, gone ten minutes after its last use and on every restart, so the vault forgot its open tabs, settings and plugins. It is now stored per person with the brain's runtime state, 32 MiB at most, and is there after a restart and from that person's other devices. Other hidden folders stay temporary.
