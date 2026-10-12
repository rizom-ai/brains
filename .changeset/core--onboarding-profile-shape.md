---
"@brains/onboarding": patch
---

The onboarding playbook no longer tells the model to write `kind: person` into the anchor profile. The anchor category comes from instance configuration and the profile schema rejects `kind`, so every onboarding profile save failed with "Unrecognized key: kind". A canonical test now saves the playbook's exact profile shape through the entity service, so the playbook and the schema cannot drift apart again.
