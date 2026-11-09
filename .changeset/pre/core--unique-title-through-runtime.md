---
"@rizom/brain": patch
---

A first-party entity's generation can check that its title is free, and ask for another when it is taken, through the internal runtime it is handed, as the entity plugin classes' generations did. It is internal to the brain's own packages. The check now reads the taken title at the generation's own scope, its requester's or the package's, where the classes read at public scope: a title held by a record the requester can see but the public cannot is renamed, rather than its id deduplicated beside the hidden record.
