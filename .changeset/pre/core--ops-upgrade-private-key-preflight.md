---
"@rizom/ops": patch
---

Fail generated pilot Upgrade workflows before checkout when either the repository's GitHub App ID variable or private-key secret is missing. The preflight observes only whether the secret exists; upgraded package code still runs before any privileged App token is minted.
