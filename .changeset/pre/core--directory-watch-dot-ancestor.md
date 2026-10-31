---
"@rizom/brain": patch
"@brains/directory-sync": patch
---

A running brain picks up files added, edited and deleted in `brain-data/` again when the brain lives under a dot-directory such as `~/.local/share` or `~/.config`. The directory watcher ignores dotfiles and dot-directories only inside the sync path (`.git`, `.obsidian`); a dot-directory above it no longer hides the whole tree, which left those changes unseen until the next start.
