---
"@brains/entity-service": patch
"@brains/plugins": patch
"@brains/atproto": patch
---

Expose received HTTP outcomes through the public file capability without requiring plugins to import database actor internals. Preserve validated PDS blob receipts after file-delivery failure as received evidence, not successful completion. Match the submitted source facts, retain original causes, exclude unrelated provider fields from reporting, and never replay the upload.
