---
"@rizom/brain": patch
---

The data-URL bridge for asset-backed images and PDFs is removed.

- Every entity read now hands back what is stored. An asset-backed record's `content` is its `asset://sha256/<hex>` reference, including through `EntityReader.get` and `list` in the public authoring API. Read the bytes with `readBytes`.
- The `binaryContent` read option is gone, and so is its legacy default, which turned a reference back into a data URL.
- `system_status` no longer reports `legacyBinaryContent`, the per-surface count of such reads, and the runtime no longer collects it. The first boot deletes the counts earlier releases kept in runtime state.
- Output is unchanged. A site build encodes covers from their bytes, and `entity://{type}/{id}` still returns an asset-backed record as a data URL.
