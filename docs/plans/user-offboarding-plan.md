# Explicit pilot user offboarding

## Status

Implemented in `@rizom/ops` through `brains-ops user:offboard` and the scaffolded
`.github/workflows/offboard.yml` workflow.

## Why this exists

Pilot reconcile and deploy flows create or update desired infrastructure. Deleting a
user file alone does not remove Hetzner servers or Cloudflare records, and generated-file
deletions could previously be mistaken for deploy work.

Offboarding is therefore a separate, explicitly confirmed operation. Ordinary desired
state edits never imply infrastructure destruction.

## Managed retirement scope

For each approved handle, the offboarding operation:

- archives the private content repository;
- deletes managed primary, preview, and applicable `www` DNS records;
- destroys the dedicated `rover-<handle>` Hetzner server;
- removes `users/<handle>.yaml`;
- removes plaintext and encrypted per-user secret files;
- removes generated `users/<handle>/` output;
- removes cohort membership and deletes a cohort file if it becomes empty;
- regenerates `views/users.md`.

It does not create a runtime backup. Operators must arrange one separately before apply
when owner or retention policy requires it.

## Safety model

### Dry-run first

The CLI defaults to a read-only provider inspection and prints the exact server, DNS,
and repository operations:

```sh
bunx brains-ops user:offboard . alice bob
```

### Exact canonical confirmation

Apply requires both `--apply` and the exact sorted, deduplicated batch confirmation:

```sh
bunx brains-ops user:offboard . alice bob \
  --apply --confirm sunset:alice,bob
```

A missing or mismatched confirmation fails before provider inspection or mutation.

### Provider identity checks

The command derives targets from the validated pilot registry:

- server: `rover-<handle>` selected by its exact `brain` label;
- primary domain: resolved user domain;
- preview domain: the canonical preview-domain helper;
- custom-domain `www` alias when applicable;
- content repository: resolved user override or the pilot prefix convention;
- Cloudflare zone: resolved user override or `CF_ZONE_ID`.

It refuses multiple matching servers, unexpected DNS names or record types, and A records
that point somewhere other than the retiring server.

### Mutation order and replay

The apply order is:

1. archive content repositories (reversible);
2. delete DNS records;
3. destroy servers;
4. verify provider cleanup converges;
5. remove desired state and regenerate the users view.

Missing provider resources and already archived repositories are successful no-ops, so a
partially completed operation can be rerun safely. A provider failure occurs before the
repository cleanup step, leaving checked-in desired state available for a retry.

### Deploy isolation

The scaffolded deploy handle resolver ignores changed generated files when
`users/<handle>.yaml` no longer exists. The bot commit created by Offboard therefore
cannot route retired handles back through onboarding or deployment.

## Scaffolded workflow

The manual **Offboard** workflow accepts:

- `handles`: comma-separated handles;
- `confirm`: canonical `sunset:<sorted handles>` confirmation;
- `apply`: false by default.

The workflow:

1. checks out current `main`;
2. loads provider credentials through the existing Varlock action;
3. normalizes and validates the handle list;
4. always runs a dry-run plan;
5. applies only when `apply: true` and confirmation matches;
6. allows changes only under `cohorts/`, `users/`, and `views/users.md`;
7. commits the removal as `github-actions[bot]`.

## Required environment

The default provider driver uses:

- `HCLOUD_TOKEN`;
- `CF_API_TOKEN`;
- `CF_ZONE_ID` unless a user has a zone override;
- the environment variable selected by `pilot.yaml.contentRepoAdminToken` for GitHub
  repository administration.

The content-repository token must have permission to archive the resolved repositories.

## Verification

A successful apply requires:

- content repositories report archived;
- DNS lookups return no managed records;
- server lookup returns no matching instance;
- user source, encrypted secrets, and generated directory are absent;
- no cohort contains the retired handles;
- `views/users.md` no longer contains them.

Retained fleet health remains a separate post-offboarding operator check.
