---
"@rizom/ops": patch
---

Restore `brains-ops secrets:push <repo>` as a shared GitHub Actions secret sync command so operators can push repo-wide pilot secrets like `GIT_SYNC_TOKEN` and `MCP_AUTH_TOKEN` from local env files without hand-written `gh secret set` calls.
