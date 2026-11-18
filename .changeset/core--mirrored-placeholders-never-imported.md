---
"@rizom/brain": patch
---

A placeholder an earlier export mirrored is no longer stored as a record's bytes.

- Directory sync skips a file holding the old pending document placeholder, and skips the old 1x1 placeholder PNG for an image still awaiting its bytes, binary or text-form. The file stays in place and is reported as skipped. Before, a document that `assets:migrate` had cleared took its mirrored placeholder back on the next boot, as a published asset.
- `assets:reconcile` reports such a file as `old pending placeholder, ignored` and creates or restores nothing from it.
- A complete image may still be any 1x1 PNG.
