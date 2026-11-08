---
"@rizom/brain": patch
---

The Obsidian vault sync is a declarative service. Once the brain is ready it renders every entity type into the vault as before, under the same `obsidian-vault` plugin and `baseFolder` config: templates and fileClasses regenerated, bases written only where missing, bases under their earlier names moved to the current ones, and a vault it cannot write logged without stopping the brain.
