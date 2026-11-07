---
"@rizom/brain": patch
---

Studio opens an entry of a type declared with `defineEntity` with its frontmatter, and saving it keeps the authored frontmatter the type does not own. A declared type's reads carry its body alone, so the editor showed such an entry without its fields and a save dropped keys such as a grouping's values. The editor, its collection lists, folders and grouping members, and editor assist now read a declared type's stored document. An update that hands a declared type back its body alone, as a package writing through its own entities does, keeps the stored frontmatter the type does not write; a writer that sends the whole document, as a file import does, still decides what it keeps. Types written as entity plugin classes read and write as before.
