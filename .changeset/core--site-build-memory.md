---
"@rizom/brain": patch
---

Site builds of large brains use less memory and stay closer to linear time: the input fingerprint hashes each page instead of the whole build, route generation and the image scan read entities a page at a time, the prepared build keeps each page's data instead of copying it, a book's sections are read through the slug index, Tailwind reads the classes collected while pages render instead of scanning every page, and a theme page reads its neighbours' fields without loading their text. An unpaginated index, such as `/books`, now lists every entity rather than the first 100.
