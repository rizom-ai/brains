# Onboarding Checklist

1. Run `bun install` so the repo uses its pinned `@rizom/ops` version.
2. Run `bunx brains-ops age-key:bootstrap <repo> --push-to gh`.
3. Fill in `pilot.yaml`.
   - keep your pinned `brainVersion`
   - confirm shared selectors for `aiApiKey`, `gitSyncToken`, and `contentRepoAdminToken`
   - use different tokens for `contentRepoAdminToken` and `gitSyncToken`: admin creates/checks content repos; sync is used by runtime directory-sync
   - confirm `agePublicKey`
4. Run `bunx brains-ops user:add <repo> <handle> --cohort <cohort>`.
   - Discord is enabled by default for pilot users.
   - if the user should be an anchor there, add `--anchor-id <discord-user-id>`.
   - the command creates `users/<handle>.yaml`, `users/<handle>.secrets.yaml`, and the cohort membership without duplicating existing entries.
5. Edit the generated user file if the anchor profile needs richer metadata.
   - For browser/CMS-first onboarding, add `setup.delivery: email` and `setup.email` to the user file.
   - For ATProto publishing, add `atproto.identifier` to the user file; put only `atprotoAppPassword` in the per-user secrets file.
   - Ensure `SETUP_EMAIL_API_KEY` and `SETUP_EMAIL_FROM` exist as GitHub Secrets before deploying any email-setup user.
6. Run `bunx brains-ops render <repo>`.
7. Run `bunx brains-ops ssh-key:bootstrap <repo> --push-to gh`.
8. Run `bunx brains-ops cert:bootstrap <repo> --push-to gh`.
9. Keep raw user secret material locally for now (`.env.local`, file-backed env vars, or equivalent local inputs), including `CONTENT_REPO_ADMIN_TOKEN` for operator onboarding.
10. Run `bunx brains-ops secrets:encrypt <repo> <handle>`.
11. Commit and push `users/<handle>.secrets.yaml.age`.
12. Run `bunx brains-ops onboard <repo> <handle>`.
13. Verify the deployed Rover contract:
    - all presets:
      - `https://<handle>.rizom.ai/health` returns `200`
      - unauthenticated `POST https://<handle>.rizom.ai/mcp` returns the expected auth failure
      - background jobs are not repeatedly failing, except for expected missing optional integrations
    - for `presetOverride: default` users:
      - `https://<handle>.rizom.ai/` loads the browser/site surface
      - `https://<handle>.rizom.ai/cms` loads the CMS/login surface
      - initial site build completes
      - content repo exists and runtime sync is healthy
      - passkey setup/handoff is completed
14. For fleet upgrades, edit `pilot.yaml.brainVersion` and push once; CI rebuilds the shared image tag, refreshes generated user env files, and redeploys affected users.
15. For Discord users, hand the Discord setup details to the user. For email-setup users, confirm they received the setup email and completed passkey registration.
16. Hand over the browser defaults:
    - Dashboard: `https://<handle>.rizom.ai/`
    - CMS: `https://<handle>.rizom.ai/cms`
    - GitHub token guidance for CMS access to the user's private content repo
17. If they need direct client access, use OAuth/passkey-capable clients where possible.
18. If you are also giving them a content repo workflow, describe it as optional and frame git/Obsidian as an advanced file-based path, not the default.
19. Send `docs/user-onboarding.md` to the user as the pilot handoff guide.
