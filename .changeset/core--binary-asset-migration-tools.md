---
"@rizom/brain": patch
"@rizom/ops": patch
"@brains/entity-service": patch
"@brains/image": patch
"@brains/directory-sync": patch
"@brains/deploy-support": patch
---

Offline tools move images stored as inline data URLs into durable assets. Each runs only against a local entity database no other process holds open, detected from open file handles, and never takes a lock.

- `brain assets:migrate --dry-run` decodes every inline image one row at a time and classifies it as ready, or blocked as SVG, malformed, double-encoded, unsupported or oversized, reporting distinct and duplicate bytes, the full-text rows and content hashes that change, and the peak disk the migration needs. It fails while anything is blocked.
- `brain assets:migrate` brings the entity schema forward, refuses while anything is blocked, then migrates one row at a time: the bytes are staged in committed chunks and published with the row's new reference, binary metadata and content hash, and its full-text row is removed. Identity, visibility and timestamps are kept; a markdown seed's stored newline is tolerated; a rerun skips migrated rows; the placeholder a pending or failed image held is cleared, while a completed image with the same bytes migrates as any other. Each run is appended to a manifest that never holds bytes.
- `brain assets:verify` checks that every reference resolves to an intact asset, that no inline image or image full-text row remains and, with `--brain-data`, that each mirrored file holds the stored bytes, a markdown image file compared by the bytes it decodes to.
- `brain assets:reconcile` restores absent rows and lost assets from `brain-data`, repairs inline rows whose bytes were lost from their file, and reports references that disagree with their file without changing them.

The pre-deploy backup verifies the image assets in its `brain.db` snapshot, every referenced asset intact and hashing to its digest, or the backup fails and blocks the deploy; it records the asset inventory and orphan uploads beside the snapshot. Regenerate `deploy/scripts/create-predeploy-backup.ts` in existing deployments to adopt it.
