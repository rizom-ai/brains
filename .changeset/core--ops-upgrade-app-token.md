---
"@rizom/ops": patch
---

Make the generated pilot Upgrade workflow mint a repository-scoped GitHub App token with explicit contents, pull-request, and workflow-file permissions, instead of relying on an Actions token that cannot push refreshed workflow files. Document the one-time App/bootstrap setup and fail-closed operator procedure.
