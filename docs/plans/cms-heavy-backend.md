# Plan: CMS Heavy Backend (Brain as Git Gateway)

## Status

Proposed. Third plan in the integrated-auth sequence (Brain OAuth Provider → A2A Request Signing → this). Depends on the OAuth provider being in place.

## Context

The CMS today is a Sveltia SPA mounted at `/cms` (`plugins/cms/src/plugin.ts:109`, transitioning to `plugins/admin` per `cms-on-core.md`). Auth is entirely client-side: Sveltia talks directly to GitHub via GitHub OAuth, commits to the content repo, directory-sync brings changes back. The brain is a static-shell host; it never sees credentials and never touches commit operations.

That model works for a single technical operator. It does not work for relay's multi-user case, where the brain is a team-collaboration tool that includes non-technical members (writers, designers, reviewers). With Sveltia → GitHub direct, every editor needs:

- a GitHub account
- collaborator access on the content repo
- 2FA / SSO compliance with the GitHub org's policies
- familiarity with the GitHub auth flow

It also fragments identity: Discord knows team members one way, MCP knows them another (via the brain's OAuth provider once plan 2 lands), CMS knows them as GitHub users. Three identity systems, three places to add and remove people, three permission models.

This plan moves the CMS commit path through the brain. Editors authenticate to the brain (passkey) and the brain commits on their behalf using a single brain-held GitHub credential. Identity unifies across surfaces. Editors no longer need GitHub accounts.

## Goal

The brain implements the Decap/Sveltia Git Gateway protocol. Sveltia is configured with `backend.name: git-gateway` and points at the brain. Editors authenticate with the brain's OAuth provider (passkey). Commits to the content repo are made by the brain on the editor's behalf, with the editor's identity (from JWT claims) attributed as the commit author. The brain validates content against entity schemas before commit.

## Non-goals

- Replacing GitHub as content storage. Commits still flow into the GitHub content repo; directory-sync still syncs them back into the brain.
- Building a custom editor. Sveltia remains the browser-facing CMS; only its backend changes.
- Drafts that never commit, scheduled publishing, multi-step approval workflows. These are valid follow-ons enabled by the heavy architecture, but out of scope for v1.
- Brain-side full Git operations (merge, rebase, branch management). The gateway implements the Sveltia-required subset, no more.
- Replacing the existing `GIT_SYNC_TOKEN` flow used for non-CMS sync (`packages/brains-ops/src/content-repo.ts:186`). That credential may be reused or split — see open questions.

## Architectural decisions

### 1. Decap Git Gateway protocol, not a homegrown shape

Sveltia inherits Decap CMS's Git Gateway backend. The protocol is documented and stable. Implementing it means Sveltia integration is a config change, not a fork. The brain implements only the endpoints Sveltia actually calls — typically a small subset:

- `GET /api/v1/repos/:repo/git/refs/heads/:branch` — branch resolution
- `GET /api/v1/repos/:repo/contents/:path` — read file
- `PUT /api/v1/repos/:repo/contents/:path` — write file (commit)
- `DELETE /api/v1/repos/:repo/contents/:path` — delete file (commit)
- `POST /api/v1/repos/:repo/git/blobs`, `/trees`, `/commits` — multi-file commits
- media upload endpoints

This is the bounded scope. We do not implement the full GitHub API, only the slice Sveltia exercises.

### 2. Brain holds one GitHub credential, scoped narrowly

A fine-grained PAT or a GitHub App installation, scoped to:

- the content repo only (not the org, not other repos)
- contents: read/write
- nothing else

A GitHub App is the longer-term right answer (rotatable, revocable, attributable on GitHub's side as "Brain X"). A fine-grained PAT is the lower-effort start. Choice is deferred to implementation.

This credential is more sensitive than the previous `GIT_SYNC_TOKEN` because it now mediates every editor commit, not just sync. Storage and rotation must be deliberate.

### 3. JWT-based commit attribution

Every gateway endpoint requires a valid brain-issued JWT (from plan 2's OAuth provider). The JWT's identity claims (display name, email) populate the commit's `author` field; the brain identifies as `committer`. `git log` then shows:

```
Author: Anna Writer <anna@example.com>
Committer: Brain <brain@your-domain.example>
```

This preserves "who wrote the change" in version history even though GitHub's auth view is "the brain pushed it."

### 4. Brain-side schema validation before commit

The CMS already generates entity-schema-aware Sveltia configs (`shared/cms-config`). The gateway uses the same schemas to validate incoming content before issuing a GitHub commit. Invalid edits are rejected at the brain, never reaching GitHub. This catches what client-side Sveltia validation might miss and removes a class of "garbage in main" risk.

### 5. Identity in `permissionService` gates editing

The JWT validation middleware (plan 2) already resolves the caller to a `permissionService` level. Gateway endpoints additionally check: only callers at `trusted` level or above may write. `public` callers can read public content but not write. This unifies the permission model across MCP, A2A, and CMS — one place to manage who can do what.

For finer-grained per-path or per-collection permissions (writer can edit blog posts but not site config), a follow-on extension to `permissionService` is needed. V1 ships coarse trusted-or-not.

### 6. Plugin home

The gateway lives in `plugins/admin` (per `cms-on-core.md`'s direction). Sveltia config generation (already in `shared/cms-config`) gets a switch: `backend.name: git-gateway` when this plan ships, with the gateway's API root pointing at the brain.

## Design

### Sveltia configuration delta

`plugins/admin` rewrites `/cms/config.yml` to swap:

```yaml
# before
backend:
  name: github
  repo: your-org/content

# after
backend:
  name: git-gateway
  api_root: https://your-brain.example.com/api/v1
```

The repo identity is implicit on the brain's side (one brain → one content repo at v1).

### Gateway endpoint shape

Each endpoint:

1. validates JWT via the shared middleware from plan 2
2. resolves the user identity for commit attribution
3. checks `permissionService` level (read-only for `public`, write for `trusted`+)
4. for writes: validates content against entity schemas
5. uses the brain's GitHub credential to perform the underlying GitHub API call
6. returns a Sveltia/Decap-compatible response

### Multi-file atomic commits

Sveltia's "rename a section" or "publish a deck" operations can touch multiple files. The gateway uses GitHub's git-data API (blobs → tree → commit → ref update) to bundle them into one commit, rather than issuing one commit per file. This is closer to what an editor expects ("I made one logical change") than what the current Sveltia → GitHub flow produces.

### Media handling

Sveltia uploads media via the same gateway. The brain forwards to the content repo's configured media path (or, for binary-heavy use cases, an alternative storage backend later). V1: just commit media to the repo like any other file.

### Failure modes

The gateway is now in the editing critical path. Failure modes:

- brain down: editors cannot edit. Acceptable; documented. For self-hosted brains the operator decides their availability target.
- GitHub down: gateway returns Sveltia-compatible error responses. Sveltia should already handle these gracefully (it does in the GitHub-direct flow today).
- credential revoked or expired: gateway returns a clear error and surfaces to operator dashboard. Worth a `/health` extension that checks the GitHub credential's validity.

### Audit trail

Two layers:

1. GitHub: commits show author = editor, committer = brain. `git log` is the durable record.
2. Brain: every gateway request is logged with JWT subject, action, target path, commit SHA. Useful for "who tried to edit what when," including failed/rejected edits that never reach GitHub.

## Rollout

### Phase 1 — gateway endpoints (read-only)

- implement `refs`, `contents` (GET) endpoints
- wire JWT validation from plan 2's middleware
- verify Sveltia loads content through the gateway in read-only mode
- existing GitHub-direct write flow still active during this phase

### Phase 2 — gateway endpoints (write)

- implement `contents` PUT/DELETE, multi-file commit via git-data API
- attribution from JWT claims
- schema validation before commit

### Phase 3 — Sveltia config switch

- `plugins/admin` config generation switches to `git-gateway` backend
- `/cms/config.yml` points at the brain
- Sveltia → GitHub direct path is decommissioned for users coming through the gateway

### Phase 4 — credential management

- replace or rescope `GIT_SYNC_TOKEN` with a GitHub App or fine-grained PAT for gateway use
- document rotation procedure
- add health check that validates the credential

### Phase 5 — multi-user onboarding

- editors register passkeys with the brain (per plan 2's enrollment flow)
- no GitHub account required for editing
- relay README and operator docs updated

### Phase 6 — follow-on capabilities (out of scope for v1, listed for sequencing)

- drafts in brain that don't commit until publish
- scheduled publishing
- multi-step approval workflows
- per-collection permission granularity in `permissionService`
- alternative storage backends (e.g., media to S3, content to Postgres)

## Open questions

1. GitHub App vs fine-grained PAT for the brain credential? App is rotatable and properly attributable; PAT is faster to implement. Probably start with PAT, migrate to App when other GitHub integrations also benefit.
2. One brain → one content repo, or one brain → many content repos? V1 assumes one. Multi-repo is a relay-scale concern; defer.
3. Should `GIT_SYNC_TOKEN` be reused for the gateway or kept separate? Separate is safer (different scopes, different rotation cadence) but adds operator config. Probably separate.
4. Does the gateway need to support Sveltia's "preview" mode (rendering drafts without commit)? The architecture allows it, but v1 ships without — drafts hit GitHub immediately, just as today.
5. Should the gateway expose its own `/health` reporting GitHub credential validity, or is that a `plugins/admin` health concern? Probably the latter — `plugins/admin` owns admin health.
6. How does the gateway handle force-push or branch-management operations that Sveltia might issue? Most are unnecessary for normal editing; reject them with a clear error rather than silently allow.

## Verification

1. Sveltia loads `/cms/config.yml` with `backend.name: git-gateway` and connects to the brain's gateway endpoints
2. An authenticated editor can read existing content through the gateway
3. An authenticated editor can commit a new file through the gateway; the GitHub commit shows the editor as author, brain as committer
4. An unauthenticated request to any gateway endpoint returns 401
5. A `public`-level caller cannot write through the gateway
6. A multi-file edit (e.g., rename across files) produces one commit on GitHub, not several
7. Schema validation rejects invalid content at the brain before any GitHub call
8. An editor with no GitHub account can fully edit content through the brain
9. Sveltia's media upload path works through the gateway
10. The brain's GitHub credential can be rotated without interrupting in-flight editing sessions (graceful credential reload)
11. Existing directory-sync inbound flow continues to work — commits made through the gateway are picked up and indexed

## Related

- `docs/plans/brain-oauth-provider.md` — required dependency
- `docs/plans/a2a-request-signing.md` — sequenced before this plan
- `docs/plans/cms-on-core.md` — establishes `plugins/admin` ownership and shared HTTP surface
- `docs/plans/multi-user.md` — co-evolves; user entities populate commit attribution
- `docs/plans/relay-presets.md` — relay is the primary motivating use case
