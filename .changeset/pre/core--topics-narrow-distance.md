---
"@rizom/brain": patch
---

Topic extraction and topic reconciliation ask the embedding index only for topics when they look for a topic to merge with, and reconciliation only for topics within its merge distance. Before, each lookup returned the distance to every embedded entity in the brain.
