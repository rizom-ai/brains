# Onboarding Checklist

1. Run `bun install` so the repo uses its pinned `@rizom/ops` version.
2. Run `bunx brains-ops age-key:bootstrap <repo> --push-to gh`.
3. Fill in `pilot.yaml`.
   - keep your pinned `brainVersion`
   - confirm shared selectors for `aiApiKey`, `gitSyncToken`, and `mcpAuthToken`
   - confirm `agePublicKey`
4. Add or edit `users/<handle>.yaml`.
   - Discord is enabled by default for pilot users
   - if the user should be an anchor there, set `discord.anchorUserId` to their Discord user ID
5. Add the user to a cohort in `cohorts/*.yaml`.
6. Run `bunx brains-ops render <repo>`.
7. Run `bunx brains-ops ssh-key:bootstrap <repo> --push-to gh`.
8. Run `bunx brains-ops cert:bootstrap <repo> --push-to gh`.
9. Keep raw user secret material locally for now (`.env.local`, file-backed env vars, or equivalent local inputs).
10. Run `bunx brains-ops secrets:encrypt <repo> <handle>`.
11. Commit and push `users/<handle>.secrets.yaml.age`.
12. Run `bunx brains-ops onboard <repo> <handle>`.
13. Verify the deployed rover core contract:
    - `https://<handle>.rizom.ai/health` returns `200`
    - unauthenticated `POST https://<handle>.rizom.ai/mcp` returns `401`
14. For fleet upgrades, edit `pilot.yaml.brainVersion` and push once; CI rebuilds the shared image tag, refreshes generated user env files, and redeploys affected users.
15. Hand the Discord setup details to the user.
16. Hand over the browser defaults:
    - Dashboard: `https://<handle>.rizom.ai/`
    - CMS: `https://<handle>.rizom.ai/cms`
    - GitHub token guidance for CMS access to the user's private content repo
17. If they need direct client access, also hand over the MCP connection details.
18. If you are also giving them a content repo workflow, describe it as optional and frame git/Obsidian as an advanced file-based path, not the default.
19. Send `docs/user-onboarding.md` to the user as the pilot handoff guide.
