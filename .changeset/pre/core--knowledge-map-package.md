---
"@rizom/brain": patch
---

The knowledge map is its own package, `@brains/knowledge-map`, installed with topics, which it draws its territories from. It renders and reads the same map: its site section template and data source are now `knowledge-map:knowledge-map` (they were `topics:knowledge-map`), and its Dashboard widget is `knowledge-map:knowledge-map` (it was `topics:topics-knowledge-map`). A site that names the old template or data source names the new one.
