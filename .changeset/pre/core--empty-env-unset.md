---
"@rizom/brain": patch
---

An environment variable set to an empty string now counts as unset in `brain.yaml` interpolation, the way deploy tooling passes a secret that is not configured. The plugin it configures is skipped as missing config instead of failing validation on an empty value.
