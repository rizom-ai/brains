---
"@brains/contracts": patch
"@brains/document": patch
"@brains/document-plugin": patch
"@brains/plugins": patch
"@brains/content-pipeline": patch
"@brains/directory-sync": patch
"@brains/social-media": patch
"@brains/chat": patch
"@brains/web-chat": patch
---

Prepare the coordinated 0.3 document file contract: store completed PDFs as transaction-bound assets, keep pending placeholders empty, and use scoped native file inspection, publication, export and delivery instead of controller buffers. Remove inline-PDF and buffered attachment-provider compatibility. Preserve authorization and uncertain publication outcomes; keep file loans through publishing acknowledgements and HTTP body handoff. Existing 0.2 inline PDF data still requires an explicit offline migration; the database-only backup importer is not a document converter. Runtime factories and installed/default actor provisioning remain a separate cutover gate.
