---
"@rizom/brain": patch
---

PDF documents are stored as durable assets, as images are. A document's content is now its asset reference, and its bytes live in `brain.db` beside it.

- Uploaded and rendered PDFs stage their bytes and publish them with the record. A pending document holds no placeholder PDF.
- Documents are no longer full-text indexed.
- Chat downloads stream the stored bytes, and publishing reads them through the document it publishes.
- The `entity://document/{id}` resource still returns a PDF data URL.
- Directory sync imports a PDF from a file stream. Its sidecar stays the document's metadata, without the recorded size, and is updated when only the metadata changes.
- `brain assets:migrate`, `assets:verify` and `assets:reconcile` handle documents beside images. They migrate inline PDFs, clear old pending placeholders, verify references and mirrored PDFs, and rebuild documents from `brain-data/document`.
- The migration manifest names each row's `entityType`.

Run `brain assets:migrate` after upgrading to move existing PDFs.
