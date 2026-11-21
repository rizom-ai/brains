---
"@rizom/brain": patch
---

Every stored entity is framed one way, whatever wrote it: its header, the body directly under it, and one newline at the end. A file import, a tool update, a projection and a visibility change now store the same bytes for the same record. A write keeps the key order of the document it replaces, writes no schema default its author did not state (the site-info record no longer gains `represents: anchor`), keeps a stated `created` or `updated` that is a real date, and keeps an unknown key, nested one level included, so a site-info `cta.subtitle` is no longer deleted. An imported file that holds a key its type does not name is imported and logged as a warning.

Stored rows are brought to this framing quietly on every start, once startup content settles: only their content changes, `updated` stays, no derived work is queued and the embedding is kept, and the file is exported once. An unchanged file whose row was stored in an earlier framing is not re-imported. A row whose stored form differs beyond its framing is left as it is and counted, for a later release.

The site-info type reads its file in either the current form or the flat form a later release will write, where the call to action is `ctaHeading`, `ctaButtonText` and `ctaButtonLink` in the header and the call-to-action subtitle, the section blurbs and the translations are sections of the body. It still writes the current form. The call to action's `subtitle` is a site-info field, so the personal homepage shows it.
