---
"@rizom/brain": patch
---

Editing a brain's prompts takes effect on the next call instead of after a restart. For topics, an edited votes prompt re-reads every source, and topics chosen under the earlier prompt leave once the corpus has been read again, unless the new votes support them.
