---
"@rizom/brain": patch
---

The brain can no longer write the old stored form: every moved type has one encoder, the new form, and a store has no setting that selects another. A file in the old form still reads, is stored in the new form on import, and a row stored in it is brought to the new form by the quiet rewrite on start. The rewrite no longer reports rows it deferred, since none wait for a later release.
