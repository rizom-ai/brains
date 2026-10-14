---
"@rizom/ops": patch
---

Add an optional per-user `anchorKind` (`person`, `team` or `organization`) to pilot user config, rendered as `anchor:` in the instance `brain.yaml`. A `team` or `organization` anchor makes the brain collectively owned, so its admins can be replaced; left unset, the runtime keeps its `person` default and existing instances are unchanged.
