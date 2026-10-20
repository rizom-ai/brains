---
"@rizom/brain": patch
---

Entity services gain `nearestToEntity`: visible entities of given types nearest an entity's stored embedding, closest first, within a distance and a limit, in one store query. Related-entry lookups (a book section's margin themes, a theme's passages) use it instead of projecting the whole semantic space for every page, which built a pairwise matrix per page and made a book brain's site build quadratic: Nietzsche's 3,738 sections now build in about a minute instead of overrunning the build deadline. A semantic projection whose origin is of another type reads that origin alone.
