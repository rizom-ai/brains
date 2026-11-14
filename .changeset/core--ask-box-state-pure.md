---
"@rizom/brain": patch
---

Studio's and the dashboard's browser bundles no longer carry Web Chat's shared ask-box record: its declaration in the contracts is side-effect free, so a bundle that does not read it drops it.
