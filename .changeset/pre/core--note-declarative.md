---
"@rizom/brain": patch
---

The notes are a declarative entity package, composed under their plugin id `note`, with the same `note:generation` and `note:upload-import` jobs, `note:generation` template, `note:capture` answer, eval and AT Protocol records. A note reads back as its body, its frontmatter its metadata, and is stored, imported and exported byte for byte as before: a plain note stays plain, a stated title stays stated. A note's metadata may leave out its title, which it takes from the body, so Studio creates a note without one, as before.
