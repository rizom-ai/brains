# Onboarding Checklist

1. Run `bun install` so the repo uses its pinned `@rizom/ops` version.
2. Run `bunx brains-ops age-key:bootstrap <repo> --push-to gh`.
3. Fill in `pilot.yaml`.
   - keep your pinned `brainVersion`
   - confirm shared selectors for `aiApiKey`, `gitSyncToken`, and `contentRepoAdminToken`
   - use different tokens for `contentRepoAdminToken` and `gitSyncToken`: admin creates/checks content repos; sync is used by runtime directory-sync
   - confirm `agePublicKey`
4. Run `bunx brains-ops user:add <repo> <handle> --cohort <cohort>`.
   - Web chat is the primary interface; it needs no per-user setup beyond the passkey.
   - `user:add` currently writes `discord: enabled: true`; set it to `false` unless the user's cohort actually uses Discord.
   - if the user should be an anchor on Discord, add `--anchor-id <discord-user-id>`.
   - the command creates `users/<handle>.yaml`, `users/<handle>.secrets.yaml`, and the cohort membership without duplicating existing entries.
5. Edit the generated user file if the anchor profile needs richer metadata.
   - Set `setup.delivery: email` and `setup.email` so the user gets the passkey setup email — this is the default onboarding path.
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
      - `https://<handle>.rizom.ai/chat` loads the web chat and accepts passkey sign-in
      - `https://<handle>.rizom.ai/` loads the dashboard (or site surface on `default` preset)
      - `https://<handle>.rizom.ai/cms` loads the CMS/login surface
      - unauthenticated `POST https://<handle>.rizom.ai/mcp` returns the expected auth failure
      - content repo exists and runtime sync is healthy
      - background jobs are not repeatedly failing, except for expected missing optional integrations
    - for `presetOverride: default` users:
      - initial site build completes
14. For fleet upgrades, edit `pilot.yaml.brainVersion` and push once; CI rebuilds the shared image tag, refreshes generated user env files, and redeploys affected users.
15. Confirm the user received the setup email, registered their passkey, and can sign in to web chat at `https://<handle>.rizom.ai/chat`. That completes the default onboarding; everything below is per-cohort extras.
16. Hand over the browser surfaces:
    - Chat (primary): `https://<handle>.rizom.ai/chat`
    - Dashboard: `https://<handle>.rizom.ai/`
    - CMS: `https://<handle>.rizom.ai/cms`, plus GitHub token guidance if CMS editing is part of their cohort
17. For Discord-enabled cohorts, hand the Discord setup details to the user as a secondary chat surface.
18. If they need direct client access (MCP), use OAuth/passkey-capable clients where possible.
19. If you are also giving them a content repo workflow, describe it as optional and frame git/Obsidian as an advanced file-based path, not the default.
20. Send `docs/user-onboarding.md` to the user as the pilot handoff guide.
