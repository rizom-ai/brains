---
"@brains/content-formatters": patch
"@brains/conversation-memory": patch
"@brains/faq": patch
"@brains/playbooks": patch
"@rizom/brain": patch
---

Integrate structured-body codecs through existing declarative content helpers, without restoring native FAQ or summary adapters. Structured formatters validate writes through the same Zod codec used for reads. Numeric arrays and absent optional collections retain their canonical decoded values; rendering-only data-source templates no longer carry unused lossy formatters.

FAQ body composition and parsing use the body codec without changing source attribution, visibility/publication floors, full revisions or durable count/receipt identities. Summary declarations validate every recognized entry on import and export while retaining embedded frontmatter and projection envelopes; malformed entries are refused, not discarded or repaired. Existing invalid stored bodies require explicit reconciliation, not an automatic rewrite.

Only Playbook body text receives a bidirectional normalization codec. Keep frontmatter's decode-only normalization and canonical persisted metadata validation unchanged. Shared round-trip tests cover canonical decoded fixtures; this is not a migration, whole-corpus repair or guarantee for arbitrary markdown layouts.
