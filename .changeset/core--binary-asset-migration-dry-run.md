---
"@rizom/brain": patch
"@brains/entity-service": patch
"@brains/image": patch
---

`brain assets:migrate --dry-run` plans moving inline images into durable assets without writing. It runs only against a local entity database that no other process holds open, decodes every inline image one row at a time, and reports images that are ready or blocked (SVG, malformed, double-encoded, unsupported, oversized), distinct and duplicate bytes, new asset bytes, full-text rows to remove, content hashes that change and the peak disk needed to back up, migrate and compact. It fails while any image is blocked. The migration itself follows in a later release.
