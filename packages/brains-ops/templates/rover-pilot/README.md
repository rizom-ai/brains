# private brain pilot

Private desired-state repository for the hosted brain pilot. The generated repository/service name may remain `rover-pilot` for deployment identity compatibility.

This is a single operator-owned repo. Pilot users do not get their own brain repos.
Per-user deploy config lives under `users/<handle>/`, while content stays in per-user content repos.

## Operator tooling

This repo pins `@rizom/ops` in `package.json`.

Install it with:

```sh
bun install
```

Then run commands with:

```sh
bunx brains-ops <command>
```

The repo also checks in its deploy contract:

- `.env.schema`
- `deploy/kamal/deploy.yml`
- `deploy/scripts/`
- `.github/workflows/*`

`.env.schema` is the single source of truth for required and sensitive deploy vars.
Use separate GitHub tokens: `CONTENT_REPO_ADMIN_TOKEN` for operator-side content repo creation/checks, and `GIT_SYNC_TOKEN` for runtime directory-sync git access.
The default pilot image tag is `brain-${brainVersion}` end to end. A user with `siteOverride` gets an isolated `brain-${brainVersion}-sites-${packageHash}` image instead.
When the effective brain version (`pilot.yaml.brainVersion`, or a cohort override) changes and you push, CI rebuilds the required default/site tags, refreshes generated user env files, and redeploys affected users. Every external site and theme package uses its own required exact version pin; ops never infers either version from the brain or from another package.
When a push changes only deploy contract files, CI prints `No affected user configs; skipping deploy.` and stops before Kamal.

## Commands

- `brains-ops init <repo>`
- `brains-ops upgrade <repo>` — bumps `@rizom/ops` (or `--to <version>`) and refreshes the generated scaffold; the Upgrade workflow runs this on a schedule and opens a PR
- `brains-ops render <repo>` — regenerates `views/users.md` with live DNS, `/health/ready`, and unauthenticated `/mcp` status checks
- `brains-ops user:add <repo> <handle> --cohort <cohort>` — scaffolds a user file, per-user secrets template, and cohort membership
- `brains-ops onboard <repo> <handle>` — creates/seeds the user's content repo with separate admin and sync tokens
- `brains-ops age-key:bootstrap <repo>`
- `brains-ops ssh-key:bootstrap <repo>`
- `brains-ops cert:bootstrap <repo>`
- `brains-ops secrets:encrypt <repo> <handle>`
- `brains-ops reconcile-cohort <repo> <cohort>`
- `brains-ops reconcile-all <repo>`
- `brains-ops reconcile-all <repo> --dry-run` (isolated, no external content-repository access; lists both passes' changed files)

`render` owns the observational `views/users.md` projection. Reconcile owns generated per-user config and never rewrites observed status rows.

The Upgrade workflow uses a repository-scoped GitHub App token because an Actions `GITHUB_TOKEN` cannot update generated files under `.github/workflows/`. That token reaches only the final push-and-open-PR step, so it is not exposed to the freshly published tooling the workflow installs and runs. Configure the App and its `OPS_UPGRADE_APP_ID` Actions variable and `OPS_UPGRADE_APP_PRIVATE_KEY` Actions secret as described in `docs/operator-playbook.md`. If token creation or the upgrade push fails, stop; do not substitute an operator's personal credentials.

Use `docs/canonical-crossover-record.md` to record exact forward and rollback artifact pins before an approved crossover window.
