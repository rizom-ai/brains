---
"@brains/atproto-contracts": patch
"@brains/atproto": patch
"@brains/blog": patch
---

Preserve bounded blob receipt evidence in ambient AT Protocol failure events and logs. Distinguish received receipts from verified acknowledgements, retain cause/aggregate relationships, and mark incomplete or invalid evidence explicitly. Omit URLs, credentials, binary data and raw diagnostics from receipt-bearing reports; reporting failures do not erase the logged evidence or replay publication.
