---
"@rizom/brain": patch
"@brains/entity-service": patch
"@brains/directory-sync": patch
---

`brain assets:verify` checks a migrated database while the app is stopped: every image reference resolves to one published asset whose streamed chunks match its digest and the row's recorded size, and no inline images or image full-text rows remain. With `--brain-data <dir>` it also hashes each image's mirrored file, binary or text-form, against the stored bytes, so exporting rewrites nothing and reimporting changes no hash; unmirrored images are listed, not failed. Directory sync exports its image file extensions.
