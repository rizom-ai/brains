---
"@brains/webdav": minor
"@rizom/brain": minor
---

The drive takes PDFs.

- A PDF saved to `document/<id>.pdf` on the drive is stored as a document, the way an image saved to `image/` is stored as an image: only in that folder, only when the bytes are a PDF, under the action policy, and over the version the save was based on. A new one records its file name and page count; replacing one keeps what described it.
- The Rizom Brain plugin for Obsidian syncs the `document` folder both ways with it.
