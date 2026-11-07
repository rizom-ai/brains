---
"@rizom/brain": patch
---

The prompt entity type is a declarative definition built with `defineEntity`. Prompts read, store and show in Studio as before: the same frontmatter (title, target and the default's hash), the same derived slug, the same `prompt` plugin, kept out of embeddings and projection sourcing. Prompt copies still follow their defaults: materialization reads each copy as stored, so a refreshed, stamped or retitled copy keeps the authored frontmatter it carries.
