---
"@rizom/brain": patch
---

The knowledge map stays bounded however large the corpus. Up to 600 sources it draws the whole corpus as before; beyond that it draws the topics and the sources nearest each of them (eight per topic, read from stored embeddings), so a book brain's dashboard loads again instead of timing out while the map lays out thousands of points. The homepage atlas always draws every published essay, talk and project. Map ids stay within the view's limits for deeply nested entries, and an entry without a heading is labelled by its page name, as a section by its siglum.
