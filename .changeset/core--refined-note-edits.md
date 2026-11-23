---
"@rizom/brain": patch
---

Editing a refined note's text works. Every edit or replacement of a refined note was refused on approval with "expected string, received undefined" for its title and summary: the update decoded the note's body on its own, which states neither. A declared type's body is now decoded as the file it is stored as, under its stored metadata, so an edit keeps the title and summary and a replacement that states its own frontmatter takes what it states.
