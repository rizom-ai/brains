# Onboarding Checklist

1. Run `bun install` so the repo uses its pinned `@rizom/ops` version.
2. Fill in `pilot.yaml`.
3. Add or edit `users/<handle>.yaml`.
4. Add the user to a cohort in `cohorts/*.yaml`.
5. Run `bunx brains-ops render <repo>`.
6. Run `bunx brains-ops onboard <repo> <handle>`.
7. For fleet upgrades, edit `pilot.yaml.brainVersion` and push once; CI rebuilds the shared image tag, refreshes generated user env files, and redeploys affected users.
8. Hand the MCP connection details to the user.
