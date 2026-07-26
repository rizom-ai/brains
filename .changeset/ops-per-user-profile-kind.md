---
"@rizom/ops": patch
---

Add an optional per-user `profileKind` to pilot user config, rendered into the instance `brain.yaml` composition. Defaults to `professional` when unset, so existing instances are unchanged; instances that select a catalog kind (e.g. `collective`) now publish the correct anchor category instead of the hardcoded default.
