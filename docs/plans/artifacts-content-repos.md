# Plan: Pilot content repositories on Cloudflare Artifacts

## Status

**Proposed.** No code exists. Pilot content repositories are private GitHub
repositories in `pilot.githubOrg`, named `<contentRepoPrefix><handle>-content`.
`brains-ops onboard` creates them with `CONTENT_REPO_ADMIN_TOKEN`
(`packages/brains-ops/src/content-repo.ts`), every brain syncs with one shared
`GIT_SYNC_TOKEN` (optionally overridden per cohort or user), and offboarding archives
the repository through the GitHub API (`packages/brains-ops/src/user-offboard.ts`).
Users have no access to their own repository.

## Decision

- Every pilot content repository lives in one Cloudflare Artifacts namespace per pilot,
  created with `jurisdiction: "eu"`. GitHub is removed from the pilot content path.
- brains-ops is the only holder of the Cloudflare API token (`Artifacts > Edit`). Brains
  and users only ever hold repo-scoped tokens.
- Each user has two repo-scoped `write` tokens with a one-year TTL:
  - **sync token** — used by directory-sync (`GIT_SYNC_TOKEN`), never shown to anyone;
  - **access token** — shown to the anchor in Studio for their own git clients
    (`CONTENT_ACCESS_TOKEN`), never used for sync.

  Revoking or rotating one never interrupts the other.

- Both tokens are stored in the existing per-user encrypted secrets file
  (`users/<handle>.secrets.yaml.age`). A commit to that file already triggers Deploy.
- Offboarding revokes every token on the repository and keeps the repository. This
  matches GitHub archival: content retained, nobody can read or write it.
- directory-sync stays provider-agnostic. It already accepts `git.gitUrl` +
  `git.authToken`, and Artifacts accepts our Basic-auth form (any username, token as
  password). Self-hosted brains keep using GitHub through `git.repo`.

## Why

- Onboarding needs no GitHub org, admin token or repository naming scheme; one API
  call creates the repository and returns its remote and first token.
- A leaked brain credential reaches one repository, not the whole fleet.
- Users get their own repository from day one, with a clone URL and token in Studio
  after their first passkey login.

## Artifacts facts this plan relies on

From the Artifacts REST API and Git protocol docs (open beta since 2026-10-01):

- Base: `https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/artifacts/namespaces`,
  `Authorization: Bearer $CLOUDFLARE_API_TOKEN`.
- `POST /namespaces` (`namespace`, `jurisdiction`); `POST /namespaces/:ns/repos`
  returns `remote` and a `token`; `GET`/`DELETE /namespaces/:ns/repos/:name`.
- `POST /namespaces/:ns/tokens` (`repo`, `scope: read|write`, `ttl` 60–31,536,000 s,
  default 86,400) returns `id`, `plaintext`, `expires_at`;
  `GET /namespaces/:ns/repos/:name/tokens?state=`; `DELETE /namespaces/:ns/tokens/:id`.
- `import` accepts **public** HTTPS remotes only, so private GitHub repositories
  migrate by mirror push, not import.
- Push uses Git protocol v1 (no v2 receive-pack); standard git clients negotiate this.
- Pricing: $0.15 per 1,000 operations (10k/month free), $0.50/GB-month (1 GB free),
  billed from 2026-10-14, Workers Paid plan required. At the default 2-minute
  `syncInterval`, one brain costs roughly 21.6k operations/month. Image-heavy brains
  add storage, because `brain-data/image` is mirrored to git.

## Desired state

`pilot.yaml` gains:

```yaml
contentStore:
  accountId: <cloudflare-account-id>
  namespace: <pilot>-content
  apiToken: CLOUDFLARE_ARTIFACTS_API_TOKEN # secret selector
```

`users/<handle>.yaml` gains a reconciler-readable, non-secret record written by
onboarding:

```yaml
contentRemote: https://<account>.artifacts.cloudflare.net/git/<namespace>/<handle>.git
contentTokens:
  sync: { id: <token-id>, expiresAt: <iso> }
  access: { id: <token-id>, expiresAt: <iso> }
```

Reconcile renders `directory-sync.git.gitUrl: <contentRemote>`,
`git.authToken: ${GIT_SYNC_TOKEN}` and `git.accessToken: ${CONTENT_ACCESS_TOKEN}`.

## Phases

Each phase is one capability, ships with its tests written first and an `@rizom/ops`
changeset, and is accepted on the running smoke fleet before the next starts.
Validation per phase: `bun test` in the touched workspaces, `bun run typecheck`, and
`bun scripts/lint.mjs --force --filter <pkg>`.

### Phase 1 — a new smoke brain syncs through Artifacts

Walking skeleton on a fresh `smoke-artifacts` handle, so the existing smoke stress
target keeps working until Phase 5.

- `packages/brains-ops/src/artifacts-client.ts`: create namespace, create/get/delete
  repo, mint/list/revoke tokens, with injected `fetch`.
- `pilotSchema` gains `contentStore`; users gain a temporary
  `contentHost: artifacts` switch (removed in Phase 6).
- `onboard` for an Artifacts user: ensure namespace and repository, mint the sync
  token, write it into the encrypted secrets, record `contentRemote` and
  `contentTokens.sync`, seed the anchor profile through the new remote (the
  `contentRepoRemoteResolver` seam in `content-repo.ts`).
- `default-user-runner` renders `git.gitUrl` for Artifacts users.
- Tests: client request and response shapes; onboard against a fake client
  (idempotent on rerun); runner output for both hosts.
- Acceptance: a note created in Studio appears in the Artifacts repository; a commit
  pushed from an external clone appears in the brain; an image round-trips
  byte-identical; `verify-user` passes.

### Phase 2 — the user gets clone access in Studio

- `onboard` mints the access token, stores it as `contentAccessToken`, and records
  `contentTokens.access`.
- `directorySyncGitConfigSchema` gains `accessToken` (display only; the sync path
  never reads it).
- The Studio git workspace (`plugins/directory-sync/src/lib/studio-workspace.ts` and
  its Studio view) shows the credential-free clone URL, the access token, and a
  copy-ready clone command — to the anchor only.
- Tests: schema; workspace payload includes access details for the anchor and omits
  them for every other permission level; the token never appears in logs or in the
  sync remote.
- Acceptance: on `smoke-artifacts`, the anchor clones with the shown command, pushes
  a note, and sees it in the brain.

### Phase 3 — tokens renew before they expire

- `brains-ops content-tokens:renew <repo> [handle]`: for every Artifacts user whose
  sync or access token expires within 60 days, mint a replacement, re-encrypt the
  secrets file, and update `contentTokens`. The commit triggers Deploy. Replaced
  tokens expire on their own.
- `--force <handle>` rotates both tokens immediately. Then
  `content-tokens:revoke-stale <handle>` revokes every active token not recorded in
  `contentTokens`; run it only after `verify-user` passes.
- Scaffold a weekly `content-token-renewal.yml` workflow (loads `AGE_SECRET_KEY` and
  the Cloudflare API token through the existing Bitwarden/Varlock path).
- Tests: threshold selection; secrets file re-encrypted with other keys preserved;
  `revoke-stale` never revokes recorded tokens.
- Acceptance: a forced rotation on `smoke-artifacts` deploys, syncs, and leaves
  exactly two active tokens after `revoke-stale`.

### Phase 4 — offboarding revokes Artifacts access

- The offboard driver for Artifacts users revokes every active token on the
  repository and keeps the repository. Inspection reports "already retired" when no
  active tokens remain, so reruns are idempotent.
- Tests: plan and apply against a fake client, including the rerun.
- Update the retirement scope in `user-offboarding-plan.md` and the operator
  playbook.
- Acceptance: offboarding a disposable Artifacts smoke user leaves the repository
  readable through the REST API and no active tokens.

### Phase 5 — existing users move from GitHub

- `brains-ops content-repo:migrate <repo> <handle>`: create the Artifacts repository,
  `git clone --mirror` from GitHub with `CONTENT_REPO_ADMIN_TOKEN`, `git push --mirror`
  to Artifacts, compare every ref, mint both tokens, set `contentHost: artifacts`,
  and commit. After `verify-user` passes, `--finish` archives the GitHub repository.
- No write freeze is needed. On deploy, directory-sync repoints `origin`, its
  checkpoint reports `repository-identity-mismatch` and runs one full reconcile, and
  any commits the brain made after the mirror are pushed to the new remote. Users
  cannot write to the GitHub repository.
- The directory-sync stress tooling moves with the smoke user to Artifacts remotes.
- Order: the existing smoke user, one canary, then cohort by cohort.
- Tests: ref comparison failure aborts before any desired-state change; rerun after
  a partial migration converges.

### Phase 6 — the GitHub content path is removed

Removed from `@rizom/ops`: `githubOrg`, `contentRepoPrefix`, `contentRepoAdminToken`,
the shared `gitSyncToken` selector, `gitSyncTokenOverride` (cohort and user),
`contentRepoOverride`, the `contentHost` switch, `ensureGitHubRepoExists`,
`content-repo-ref.ts`, the GitHub offboarding driver, the template
`deploy/scripts/sync-content-repo.ts`, and the `GIT_SYNC_TOKEN` /
`CONTENT_REPO_ADMIN_TOKEN` entries in the scaffolded `.env.schema`, onboarding
checklist and operator playbook. `brains-ops init` scaffolds `contentStore` instead.
Delete this plan.
