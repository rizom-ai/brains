---
"@rizom/brain": patch
---

A changed anchor profile name, email or website is stored as written. Before, saving the profile wrote the previous name back over the new one in the stored profile, so the agent card, the Studio header and the site kept the old name while the brain-data file showed the new one. Directory sync also picks up edits to brain-data files when the brain's data directory sits under a dot directory (such as `~/.local/share/brain`); before, the watcher ignored every file there until the next restart.
