---
"@rizom/brain": patch
---

Documents are a declarative entity package. They are stored and created as before: the same `document` plugin id and type, kept out of embeddings and projection sourcing, storing each PDF's data URL byte for byte with its metadata beside it; the same create routes keeping an uploaded PDF under the next free id and rendering a source attachment, reusing a document already made from the same source; and the same `document:generate` job, which stores the PDF and adds it to the target's documents, replacing references to other renders of the same source. The plugin now registers as an entity plugin rather than a service plugin. `@brains/document` exports `createDocumentEntity` in place of the document adapter.
