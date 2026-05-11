# Plan: explicit user offboarding workflow for rover-pilot

## Status

Proposed. This plan describes work that lands in the deployed **rover-pilot fleet repo** (external to this monorepo), with the new template scripts (`destroy-server.ts`, `delete-dns.ts`, `derive-offboard-config.ts`) contributed back through `shared/deploy-support/src/deploy-scripts/` and/or `packages/brains-ops/templates/rover-pilot/`. All `deploy/scripts/...`, `.github/workflows/deploy.yml`, `users/<handle>.yaml`, and `pilot.yaml` paths cited below are fleet-repo paths, not paths in this monorepo.

## Why this plan exists

The repo currently supports:

- desired-state user config under `users/<handle>.yaml`
- generated deploy config under `users/<handle>/`
- CI-driven reconcile and deploy
- infra creation / reuse for Hetzner servers
- DNS upsert for main and preview hosts

But it does **not** yet support safe user removal.

Today, simply deleting a user from desired state is not enough and is not safe:

- `reconcile.yml` can remove generated `users/<handle>/` files
- `deploy.yml` is triggered by changes under `users/*/`
- `deploy.yml` assumes changed user files mean "deploy this handle"
- deploy logic depends on `users/<handle>/.env` and `users/<handle>/brain.yaml` existing
- there is no destroy path for Hetzner servers
- there is no DNS delete path for Cloudflare records
- there is no explicit offboarding operator flow

So a normal desired-state deletion can leave behind infra and may also break CI.

This plan adds a dedicated, explicit offboarding workflow.

## Goals

Add a safe, explicit, idempotent offboarding flow that can remove a pilot user and clean up the main managed resources:

- Hetzner server
- Cloudflare main and preview DNS records
- generated repo state for the user
- optional per-user GitHub secrets

The workflow should be:

- manual, not automatic
- handle-driven, not dependent on generated files still existing
- safe to rerun
- separate from `deploy.yml`

## Non-goals for v1

The first version should **not** try to fully automate every external cleanup path.

Out of scope for v1:

- deleting the user's content repo automatically (the workflow should log a reminder that content repo cleanup is manual)
- deleting or reconfiguring Discord applications automatically
- deleting every possible cloud artifact outside the current deploy contract
- turning normal file deletion on `main` into implicit infra destruction
- redesigning the main deploy workflow around deletion events

Those can be follow-up work.

## Design principles

### 1. Explicit destruction only

Infra deletion must happen only through a dedicated manual workflow, not through ordinary repo edits.

### 2. Two-phase mental model

We should think in two separate phases:

1. **desired-state removal**
   - remove the user from repo config
   - merge that change normally
2. **offboarding / destroy**
   - run a dedicated workflow to clean infra and external state

This keeps repo edits understandable and infra destruction intentional.

### 3. Idempotent operations

Every cleanup step should succeed even if the target resource is already absent.

Examples:

- no server found -> log and continue
- no DNS record found -> log and continue
- no GitHub secret found -> log and continue

### 4. Handle-first resolution

The workflow should derive its needed names from:

- `handle`
- `pilot.yaml.domainSuffix`

It should **not** require `users/<handle>/brain.yaml` or `users/<handle>/.env` to still exist.

## Current repo constraints

Relevant current behavior:

- `deploy/scripts/provision-server.ts`
  - creates or reuses a Hetzner server by label/name
- `deploy/scripts/update-dns.ts`
  - upserts a Cloudflare A record
- `deploy/scripts/resolve-user-config.ts`
  - derives `preview_domain`, but depends on generated user files
- `.github/workflows/deploy.yml`
  - deploys handles inferred from changed generated files under `users/*/`
- `.github/workflows/reconcile.yml`
  - regenerates and commits `users/` and `views/`

The missing pieces are:

- destroy server script
- delete DNS script
- explicit offboard workflow
- documented operator procedure

## Proposed operator workflow

### Recommended v1 operator flow

#### Step 1: remove the user from desired state in a normal PR

The operator removes:

- `users/<handle>.yaml`
- the handle from `cohorts/*.yaml`

Then merges that PR.

This reflects the intended state of the fleet.

#### Step 2: run explicit offboarding workflow manually

The operator runs a dedicated `workflow_dispatch` workflow with inputs like:

- `handle`
- `destroy_server`
- `remove_dns`
- `revoke_secrets`
- `cleanup_repo`
- `confirm`

Example confirmation string:

```text
OFFBOARD smoke
```

This second step performs the destructive cleanup.

## Proposed workflow: `.github/workflows/offboard.yml`

### Trigger

- `workflow_dispatch` only

### Inputs

- `handle` (string, required)
- `destroy_server` (boolean, default true)
- `remove_dns` (boolean, default true)
- `revoke_secrets` (boolean, default false)
- `cleanup_repo` (boolean, default true)
- `confirm` (string, required)
- `dry_run` (boolean, default true)

### Safety guard

The workflow should fail unless:

```text
confirm == "OFFBOARD <handle>"
```

This is a deliberate friction step.

### Dry-run mode

When `dry_run=true` (the default), the workflow runs the full resolution and validation pipeline but prints what **would** be deleted instead of performing any destructive operations. Every destroy/delete step should log its intended action and exit without side effects.

This is cheap to implement and significantly reduces operator anxiety for a destructive workflow.

### Job layout

Jobs run in this order:

1. `resolve_inputs` runs first
2. `destroy_infra` and `revoke_secrets` run in parallel after `resolve_inputs`
3. `cleanup_repo` runs last, after both `destroy_infra` and `revoke_secrets` complete

This ordering ensures the operator can still inspect generated files if earlier steps fail.

#### Job 1: resolve_inputs

Responsibilities:

- validate confirmation string
- run `deploy/scripts/derive-offboard-config.ts` to derive all names from `handle` and `pilot.yaml.domainSuffix`:
  - `INSTANCE_NAME=rover-<handle>`
  - `BRAIN_DOMAIN=<handle>.<zone>` (where `domainSuffix` includes the leading dot, e.g. `.rizom.ai`)
  - `PREVIEW_DOMAIN=<handle>-preview.<zone>`
  - `HANDLE_SUFFIX=$(handle | upper | '-' -> '_')`
- **hard gate:** fail immediately if `users/<handle>.yaml` still exists in the repo
- **hard gate:** fail immediately if the handle still appears in any `cohorts/*.yaml` file
- log a reminder that content repo cleanup (e.g. `rover-<handle>-content`) is manual and not handled by this workflow

Important: this job should not depend on generated user files existing.

#### Job 2: destroy_infra

Conditional based on workflow inputs.

Responsibilities:

- if requested, destroy the Hetzner server
- if requested, delete Cloudflare DNS records for:
  - main host
  - preview host

#### Job 3: revoke_secrets

Optional.

Responsibilities:

Delete per-user GitHub secrets if present:

- `GIT_SYNC_TOKEN_<HANDLE_SUFFIX>`
- `MCP_AUTH_TOKEN_<HANDLE_SUFFIX>`
- `DISCORD_BOT_TOKEN_<HANDLE_SUFFIX>`

`AI_API_KEY` should remain untouched because it is shared.

When `revoke_secrets=false`, the job should still check whether per-user secrets exist and log a warning if they do, so operators know there are lingering secrets for the deleted user.

#### Job 4: cleanup_repo

Optional.

Responsibilities:

- remove generated `users/<handle>/`
- regenerate `views/users.md`
- commit and push if there are changes

## Proposed scripts

### 1. `deploy/scripts/destroy-server.ts`

Purpose:

- delete a user's Hetzner server by derived instance name / label

Inputs:

- `HCLOUD_TOKEN`
- `INSTANCE_NAME`

Behavior:

1. list servers matching the instance label/name
2. if none exist, log and exit success
3. if one exists, issue delete request
4. poll until the server is gone or deletion is confirmed
5. write clear logs

Idempotency rule:

- server missing is success

Implementation note:

This should mirror the current Hetzner API style already used in `deploy/scripts/provision-server.ts`.

### 2. `deploy/scripts/delete-dns.ts`

Purpose:

- delete Cloudflare A records for the main and preview hosts

Inputs:

- `CF_API_TOKEN`
- `CF_ZONE_ID`
- `BRAIN_DOMAIN`
- `PREVIEW_DOMAIN`

Behavior:

1. look up an A record for each host
2. if not found, log and continue
3. if found, delete it
4. fail only on actual API errors

Idempotency rule:

- record missing is success

### 3. `deploy/scripts/derive-offboard-config.ts`

Purpose:

- centralize handle/domain derivation without depending on generated files

Inputs:

- `HANDLE`
- reads `pilot.yaml`

Outputs:

- `instance_name`
- `brain_domain`
- `preview_domain`
- `handle_suffix`

This script is required. The domain derivation logic is needed by at least three jobs, and duplicating it in shell across the workflow YAML is error-prone.

## Repo cleanup strategy

### Desired-state guard

The offboard workflow must assume the operator has already removed the user from desired state.

Hard gates enforced in Job 1 (`resolve_inputs`):

- if `users/<handle>.yaml` still exists, fail with a clear error
- if the handle still appears in `cohorts/*.yaml`, fail with a clear error

These checks run before any destructive work. This prevents accidental infra destruction while the user is still present in desired state.

### Why not auto-edit desired state in v1

Automatically editing both:

- `users/<handle>.yaml`
- `cohorts/*.yaml`

inside a destructive workflow adds risk and makes review harder.

It is safer to keep desired-state removal as an ordinary reviewed change, then run offboarding explicitly.

## Interaction with existing CI

This plan intentionally keeps offboarding separate from `deploy.yml`.

We should **not** teach `deploy.yml` to destroy infra when user files disappear.

Reasons:

- deploy semantics stay simple: changed generated files mean deploy
- destroy semantics stay explicit: manual workflow means cleanup
- accidental deletes on `main` do not immediately destroy live infra

This separation reduces surprise.

## Error handling expectations

### Expected success cases

- user removed from desired state
- no generated files remain for the user
- server deleted or already absent
- DNS deleted or already absent
- optional secrets removed or already absent

### Partial cleanup behavior

If one cleanup step fails:

- the workflow should report exactly which step failed
- resources already deleted should stay deleted
- rerunning the workflow should be safe

Examples:

- DNS delete succeeds, server delete fails -> rerun later
- server delete succeeds, repo cleanup fails -> rerun later

## Acceptance criteria

The implementation is complete when all of the following are true for a test handle such as `smoke`:

1. there is a dedicated manual offboarding workflow
2. the workflow refuses to run without a matching confirmation string
3. it can derive domains from `pilot.yaml.domainSuffix` and `handle`
4. it can delete the Hetzner server for `rover-<handle>`
5. it can delete both DNS records:
   - `<handle>.<zone>`
   - `<handle>-preview.<zone>`
6. it can remove generated `users/<handle>/`
7. it regenerates `views/users.md`
8. rerunning the workflow after cleanup succeeds without hard failure
9. the workflow does not require `users/<handle>/brain.yaml` or `users/<handle>/.env` to still exist

## Test plan

### Dry implementation validation

Before using a real user:

1. verify workflow input validation
2. verify confirmation string logic
3. verify domain derivation from `pilot.yaml`
4. verify "resource missing" paths return success

### Real validation with `smoke`

1. remove `smoke` from desired state in a normal PR
2. merge the PR
3. run `offboard.yml` with:
   - `handle=smoke`
   - `destroy_server=true`
   - `remove_dns=true`
   - `revoke_secrets=false` or true as needed
   - `cleanup_repo=true`
   - `confirm=OFFBOARD smoke`
4. verify in Hetzner that `rover-smoke` is gone
5. verify DNS records are gone for:
   - `smoke.rizom.ai`
   - `smoke-preview.rizom.ai`
6. verify `users/smoke/` is absent in the repo
7. verify `views/users.md` no longer lists `smoke`
8. rerun the workflow and confirm idempotent success

## Risks and mitigations

### Risk: accidental destruction of the wrong user

Mitigations:

- manual workflow only
- explicit confirmation string
- handle-derived logs printed before destroy steps
- optional future environment protection / required approval

### Risk: repo state and infra state drift

Mitigations:

- require desired-state removal before offboard cleanup
- keep cleanup idempotent
- make reruns safe

### Risk: domain derivation diverges from deploy logic

Mitigations:

- derive from `pilot.yaml.domainSuffix`
- centralize derivation in `deploy/scripts/derive-offboard-config.ts`
- avoid relying on deleted generated files

### Risk: stale Kamal app on surviving server

If `destroy_server=false` but `remove_dns=true`, the Kamal proxy on the surviving server may still route traffic to a stale app. This is an edge case for v1 — operators choosing to keep the server should be aware they may need to manually remove the Kamal app.

Mitigations:

- log a warning when DNS is removed but the server is kept
- document this case in operator playbook

## Follow-up work after v1

Good follow-ups, but not required for first delivery:

1. add a first-class `brains-ops offboard` CLI command
2. automate GitHub repo archive/delete for content repos
3. add Discord cleanup documentation or automation
4. add summary output listing what was deleted vs already absent
5. add a deploy guard so deletion-related repo changes never accidentally route into deploy logic in a confusing way
6. add Kamal app removal step for cases where the server is kept

## Suggested implementation order

1. add `deploy/scripts/destroy-server.ts`
2. add `deploy/scripts/delete-dns.ts`
3. add manual `.github/workflows/offboard.yml`
4. add repo cleanup and desired-state validation checks
5. document the operator flow in `docs/operator-playbook.md`
6. test with `smoke`

## Proposed file changes

New files:

- `plans/user-offboarding-plan.md`
- `.github/workflows/offboard.yml`
- `deploy/scripts/destroy-server.ts`
- `deploy/scripts/delete-dns.ts`
- `deploy/scripts/derive-offboard-config.ts`

Updated files:

- `docs/operator-playbook.md`
- optionally `README.md`

## Recommendation

Proceed with a dedicated manual offboarding workflow rather than trying to overload reconcile/deploy with deletion semantics.

That gives rover-pilot a clear and safe model:

- reconcile/deploy are for bringing desired state into existence
- offboard is for intentional cleanup and destruction
