---
"@rizom/brain": patch
---

A site package no longer embeds a runtime plugin: the brain refuses a site package that declares `plugin`. The bundled sites (personal, professional, default, organization) register their templates and data sources beside their structural definition, built from the same config their plugins took (their `entityDisplay` and the `brain.yaml` site settings), and their data sources are registered under the site's namespace (`professional-site:homepage-list`). Web Chat shares whether it serves the Ask box as `@brains/web-chat:ask-box`, which the homepages read through the public shared-state read; it rewrites the record on every start, so nothing is migrated.
