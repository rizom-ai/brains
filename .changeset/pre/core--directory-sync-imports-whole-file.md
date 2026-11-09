---
"@rizom/brain": patch
---

Directory sync imports a file whole, as an import through the entity service does, so a declared entity type keeps the frontmatter it does not write, such as a seed's `checksum`, in the stored record and the exported file.
