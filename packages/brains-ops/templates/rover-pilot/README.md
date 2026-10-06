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
The fleet publishes one immutable image per effective Brain version and site pin set: `brain-${brainVersion}` for instances without a site override, `brain-${brainVersion}--<pins>--s<digest>` for instances with one (sorted readable pins plus an exact-identity digest; long names omit the readable pins). Pinned images use new immutable tags after this format change; existing registry tags must not be overwritten. Instances with the same version and pins share an image; a site's pin change builds that site's image and no other, and smoke-to-fleet promotion reuses the tested image because its name already carries its pins. Build and Deploy verify installed package versions against an image's name before reusing it.
When an effective brain version (`pilot.yaml.brainVersion`, or a cohort override) or a site pin changes and you push, CI builds every missing image, refreshes generated user env files (an instance with site pins names its image there as `IMAGE_TAG`), and redeploys affected users. Every external site and theme package keeps its own exact version pin. Published tags remain immutable: a new pin set is a new tag.
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

The Upgrade workflow uses a repository-scoped GitHub App token because an Actions `GITHUB_TOKEN` cannot update generated files under `.github/workflows/`. Checkout persists no credential, and the App token is minted only after the freshly published tooling finishes and only when there is a change to push. Configure the App and its `OPS_UPGRADE_APP_ID` Actions variable and `OPS_UPGRADE_APP_PRIVATE_KEY` Actions secret as described in `docs/operator-playbook.md`. If token creation or the upgrade push fails, stop; do not substitute an operator's personal credentials.

Use `docs/canonical-crossover-record.md` to record exact forward and rollback artifact pins before an approved crossover window.
