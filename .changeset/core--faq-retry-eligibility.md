---
"@rizom/brain": patch
---

Keep FAQ merge retries within the initially selected visibility and question. Concurrent changes to either stop the merge without rewriting the edited FAQ; same-question, same-visibility merges still retry with storage CAS.

Fold duplicate FAQs through a native-only atomic destination update and source removal, checking both full revisions and committing FTS and projection/export journals together. Failed writes preserve both records; retries after a committed fold do not restore the source or count its askings twice. This does not add a public authoring SDK capability.
