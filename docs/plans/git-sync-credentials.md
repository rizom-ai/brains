# Git sync credentials: optional remotes and GitHub App installs

Last updated: 2026-09-16

## Status

**Proposed; preserved for revalidation.** No implementation has started. The core problem remains current: remote-less operation is supported below configuration, but `GIT_SYNC_TOKEN` is still declared as required and the hosted fleet still uses static repository credentials. File/line references below describe the 2026-09-05 tree and must be rechecked before implementation.

Today `GIT_SYNC_TOKEN` is declared `required: true` in
`plugins/directory-sync/src/env-schema.ts:6`, `directory-sync` is a `coreBundle` member
(`packages/brain-cli/src/model/canonical-bundles.ts:28`), and pilot brains authenticate to
their content repositories with a personal access token that defaults to a single fleet-wide
value shared by every user.

## Goal

Two independent outcomes:

1. A brain with no git remote is a supported, bootable configuration — no credential required.
2. Brains that do push to GitHub authenticate with a short-lived GitHub App installation token
   minted per operation, instead of a long-lived personal access token held in the environment.

## What "git" actually means here

The word covers three separable roles that are currently fused in configuration and in
operator mental models:

```text
entity DB ──export──> brain-data/*.md          role 1: file mirror
                          │
                          ├─ local git history over the mirror   role 2
                          └─ pull/push to a remote               role 3
```

- **Role 1 (file mirror)** is the portability guarantee — Obsidian interop and the promise that
  content is not trapped in SQLite. It stays mandatory. `directory-sync` stays in `coreBundle`.
- **Role 2 (local history)** needs no credential and costs nothing. It stays on by default.
- **Role 3 (remote)** is the only role that needs a credential, and it is already optional in
  the config schema.

"Make git optional" therefore means making role 3 optional in _declaration and tooling_, not
making the mirror optional.

## Current behavior

Remote-less operation already works at runtime and is blocked only by env declaration:

- `plugins/directory-sync/src/types/config.ts:149` — the whole `git` block is `.optional()`, and
  `repo` / `gitUrl` inside it are optional.
- `packages/brain-cli/src/lib/git-broker-spec.ts:64` — with neither `repo` nor `gitUrl`,
  `resolveGitBrokerSpec` returns `undefined`.
- `packages/brain-cli/src/lib/git-broker-sidecar.ts:242` — a missing spec makes
  `withGitBrokerSidecar` run the app without spawning the broker sidecar at all.
- `docs/directory-sync-git.md` — with no remote configured, startup initializes a local
  repository (`git init -b main`) and export/import proceeds normally.

So a remote-less brain needs no broker, no network, and no credential. What stops it booting is
that `required: true` renders `@required` into the generated `.env.schema`
(`shared/utils/src/env-schema.ts:34`), which varlock (`shell/app/package.json:35`) enforces at
env load. The declaration contradicts the config field one layer down, which describes itself as
"Auth token for private repos".

Credential resolution is currently static and process-wide:

- `plugins/directory-sync/src/lib/broker/host.ts:61` — `resolveGitCredential` runs **once** at
  broker startup and freezes the result into the checkout options.
- `plugins/directory-sync/src/lib/broker/checkout-executor.ts:119` — `#credentialEnv` is a getter
  that rebuilds the git environment for **every** operation, but reads that frozen value.
- `plugins/directory-sync/src/lib/broker/git-credentials.ts:70` — the credential travels as a
  `GIT_CONFIG_*`-supplied `http.<remote>.extraheader` carrying
  `Authorization: Basic base64(x-access-token:<token>)`, https remotes only.

The per-operation injection point already exists. Only the value behind it is frozen.

## Who owns pilot content repositories

This determines what changes for users, and the answer is that nothing does.

- `packages/brains-ops/src/load-registry.ts:230` — a user's content repository defaults to
  `${contentRepoPrefix}${handle}-content`, resolved against the pilot org.
- `packages/brains-ops/src/content-repo-ref.ts:16` — a bare repo name is owned by the pilot org;
  only an explicit `org/name` `contentRepoOverride` points elsewhere.
- `packages/brains-ops/src/content-repo.ts` creates and administers those repositories using a
  separate fleet `contentRepoAdminToken` (`src/schema.ts:105`).
- `packages/brains-ops/src/load-registry.ts:259` — `effectiveGitSyncToken` resolves user
  override, then cohort override, then `pilot.gitSyncToken`. The default is therefore **one
  fleet-wide token with access to every user's content repository**; the per-user
  `GIT_SYNC_TOKEN_<HANDLE_SUFFIX>` secrets that offboarding revokes
  (`docs/plans/user-offboarding-plan.md:233`) exist only where an override was set.

Pilot users do not own their content repositories, are not required to have a GitHub account,
and never see a repository credential. A GitHub App is installed on the pilot org by the org
owner and covers the same repositories that already exist. **No user migrates anything.**

The shared-token default is the strongest argument for the change: one PAT that can read and
write every pilot user's content is a blast radius that per-repository scoped installation
tokens eliminate.

## Decisions

**GitHub App installation tokens, not an OAuth user token.** An OAuth web or device flow removes
the paste-a-token step but still yields a broad, long-lived, user-scoped credential that the host
holds indefinitely. A GitHub App gives per-repository scope, ~1 hour token lifetime, minting from
a private key the fleet holds, and a grant that reads honestly as "install this app on this
repository". Installation tokens already use the `x-access-token` username that
`git-credentials.ts:71` builds, so nothing below the credential-resolution layer changes.

**The raw-token path is demoted, never deleted.** Gitea, self-hosted git, SSH, and `file://`
remotes have no App to install. `git.authToken` remains supported and remains the documented
path for non-GitHub remotes and for self-hosters who do not want to register an App.

**Self-hosters either register their own App or use a token.** The App private key is a fleet
deployment secret. Requiring every self-hoster to register an App would be a regression; the
token path covers them.

**Only an installation id is persisted, never a token.** Tokens are minted on demand and live in
broker memory for the duration of one git process, preserving the existing invariant that no
credential lands in `.git/config`, in argv, or in the checkout.

**One org-level installation, tokens scoped per repository.** The fleet installs the App once on
the pilot org rather than once per user. Each brain's minted token is scoped to that brain's own
repository, so least privilege comes from token scoping rather than from installation count. A
per-user install is required only for a `contentRepoOverride` pointing at a repository the fleet
does not own.

**The credential never reaches the browser.** Unchanged from today
(`plugins/studio/src/plugin.ts:131`). The App install callback lands on the brain's HTTP surface
and stores an installation id; the browser never sees a git credential.

**Auth-service's existing OAuth is not reusable here.** `shell/auth-service` is an OAuth
_issuer_ — `oauth_clients`, `oauth_auth_codes`, refresh-token storage — the brain handing tokens
to MCP clients. This plan makes the brain an OAuth _client_ of GitHub. The only shared machinery
is credential storage.

## Phases

Each phase is independently shippable and user-visible. Tests are written before the
implementation in every phase.

### Phase 1 — A brain with no remote is a supported configuration

Capability: an operator can configure a brain with no `git` block and boot it; content still
exports to `brain-data/` and imports back, with local history and no credential anywhere.

Tests first:

- boot a brain whose `brain.yaml` has `directory-sync` with no `git` block and no
  `GIT_SYNC_TOKEN` in the environment; assert startup succeeds, no broker sidecar is spawned,
  export and import round-trip, and local commits are made;
- assert a configured https remote with no resolvable credential fails at the first network
  operation with the actionable message, not at env load;
- assert the generated `.env.schema` no longer marks `GIT_SYNC_TOKEN` `@required` while keeping
  it `@sensitive`.

Implementation:

- `plugins/directory-sync/src/env-schema.ts:6` — `required: false`, `sensitive: true` retained.
  A conditionally-required declaration is rejected: `EnvVarDecl` is a static list rendered at
  schema-generation time and cannot see resolved plugin config; the honest enforcement point is
  the first failing push.
- `packages/brain-cli/src/lib/boot-errors.ts:39` — keep the existing git/`GIT_SYNC_TOKEN`
  message and confirm it fires on the network-operation failure path.
- `packages/brain-cli/src/commands/init.ts` — `init` stops emitting a `git` block and a
  `GIT_SYNC_TOKEN` line unless a repository is requested.

### Phase 2 — A brain authenticates to GitHub with an App installation token

Capability: an operator registers a GitHub App, installs it on the content repository, and the
brain pushes using minted installation tokens with no PAT in the environment.

Tests first:

- a credential provider that mints, caches until near expiry, and re-mints after expiry;
- `checkout-executor` requests a credential per network operation and a token expiring
  mid-session is replaced without restarting the broker;
- a revoked or uninstalled App surfaces a distinct, actionable sync failure rather than a
  generic auth error or a stall;
- the existing invariants still hold: no credential in `.git/config`, in argv, or in the
  persisted checkout.

Implementation:

- introduce a credential provider abstraction resolved per operation. `host.ts:61` stops
  freezing a string; `checkout-executor.ts:119` `#credentialEnv` becomes async and asks the
  provider. The static token becomes one provider implementation among two.
- add a GitHub App provider: JWT from the App private key, installation token minted for the
  installation id, cached with a safety margin before the ~1 hour expiry.
- git authenticates at the start of a transfer, so a mint per network operation is sufficient;
  no mid-transfer refresh is attempted.
- config gains an App form alongside `authToken`; supplying both is a configuration error, not a
  precedence rule.

### Phase 3 — Studio shows credential health

Capability: when the git credential is broken or revoked, the operator sees it in Studio and is
told what to do, instead of watching a save that silently never reaches the remote.

Tests first:

- the sync-status payload carries an attention state with a reason for revoked, expired, and
  never-configured credentials;
- the instrument strip renders the attention state and a reconnect affordance;
- a brain with no remote configured continues to render no git stations at all — absence is not
  an error state.

Implementation:

- extend `syncStatusMessageSchema` (`plugins/studio/src/editor-routes.ts:76`), whose `git` object
  currently has no failure field, with an explicit credential state;
- `handleSyncStatus` (`editor-routes.ts:469`) keeps degrading to nulls when directory-sync is
  absent, and distinguishes that from a present-but-failing credential.

### Phase 4 — The fleet stops holding a repository-wide personal access token

Capability: pilot brains authenticate with per-repository scoped installation tokens minted from
one org install. No user action, no user GitHub account, no repository migration.

Tests first:

- a brain's minted token is scoped to its own content repository and is rejected against another
  user's repository in the same org;
- reconcile generates a `brain.yaml` with no `authToken` line and no `GIT_SYNC_TOKEN` secret for
  App-backed users;
- a `contentRepoOverride` pointing outside the pilot org still resolves a credential, via either
  its own installation or a retained token;
- offboarding leaves no residual per-user git secret and no residual repository access.

Implementation:

- `packages/brains-ops/src/default-user-runner.ts:70` keeps emitting `repo:` and stops emitting
  `authToken: ${GIT_SYNC_TOKEN}`; the App private key becomes one fleet secret replacing both the
  shared `pilot.gitSyncToken` and any per-user overrides;
- scope each mint to the single repository resolved by
  `packages/brains-ops/src/content-repo-ref.ts`, so one installation does not grant one brain
  access to another's content;
- `packages/brains-ops/src/content-repo.ts` may take its `contentRepoAdminToken`
  (`src/schema.ts:105`) from the same installation, collapsing the second fleet credential;
- for a `contentRepoOverride` on a repository the fleet does not own, persist that installation
  id in `AuthAccountSettingsStore` (`shell/auth-service/src/account-settings-store.ts`), which
  provides authenticated encryption per field keyed by package, definition, actor and revision,
  and whose `string | number | boolean | null` value type fits an installation id unchanged;
- `docs/plans/user-offboarding-plan.md:233` — per-user git secret revocation becomes a no-op for
  App-backed users and is retained only for override users still on a token.

## Risks

- **Revoked installs are a new failure mode.** A user uninstalling the App breaks sync in a way a
  PAT never did silently. Phase 3 exists before Phase 4 specifically so this is visible before it
  is common.
- **Rate limits are per installation.** Higher than unauthenticated limits and above expected
  sync volume, but a new dependency to watch.
- **The App private key is a high-value fleet secret.** It replaces a shared token that already
  reached every user's content repository, so blast radius does not grow and per-repository
  scoping shrinks it — but risk concentrates in one key. Rotation must be exercised, not assumed.
- **The org install is a single point of failure.** One org-level installation covers every pilot
  brain, so an accidental uninstall stops sync fleet-wide rather than for one user. Phase 3 makes
  that visible; alerting on it belongs with existing operational alerting.

## Non-goals

- Making the `brain-data/` file mirror optional.
- Requiring pilot users to own, create, or migrate a content repository, or to hold a GitHub
  account.
- Removing `git.authToken` or the `GIT_SYNC_TOKEN` env path.
- Changing entity/git authority semantics.
- Making the brain an OAuth client of anything other than GitHub.
- Sending any git credential to the browser.
