---
"@rizom/brain": patch
---

Fix uploaded-file action routing. Summarizing uploaded PDFs is now read-only and no longer creates notes or asks for confirmation, suggested Save document/Save image actions preserve the raw upload as document/image entities, and direct creates use deduplicated ids so duplicate titles do not fail with raw database errors.
