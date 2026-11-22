---
"@rizom/brain": patch
"@brains/webdav": patch
"@rizom/ops": patch
---

The `obsidian-vault` capability is retired: the Rizom Brain plugin for Obsidian writes the templates, fileClasses and bases into the vault itself, from a description of the brain's types the drive gives sync clients (`.brain/vault-shapes.json`). A brain no longer writes `_obsidian/` into `brain-data/`; files already there are left as they are. A `brain.yaml` that still adds `obsidian-vault` boots with a warning that the name is ignored, and `brain config migrate` no longer adds it.
