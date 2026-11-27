---
"@rizom/ops": patch
---

A fleet brain whose bundles include `matrix` runs its own Matrix homeserver: `resolve-user-config` outputs `matrix_enabled`, the deploy passes it to Kamal so the homeserver accessory and its settings render, and after `kamal setup` the deploy restarts the homeserver when the brain has written it a new configuration.
