---
"@rizom/ops": minor
---

Make the generated pilot Upgrade workflow mint a repository-scoped GitHub App token with explicit contents, pull-request, and workflow-file permissions, instead of relying on an Actions token that cannot push refreshed workflow files. Checkout persists no credential, and the App token is minted only after freshly published operator tooling finishes and only when there is a change to push. An existing upgrade PR is now detected explicitly rather than inferred from a `gh pr create` failure, so credential and rate-limit errors surface instead of passing silently.

Requires setup in each existing pilot repository: the workflow fails fast until a dedicated GitHub App is installed and its `OPS_UPGRADE_APP_ID` variable and `OPS_UPGRADE_APP_PRIVATE_KEY` secret are configured. See `docs/operator-playbook.md`.
