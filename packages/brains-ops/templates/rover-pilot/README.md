# rover-pilot

Private desired-state repo for the rover pilot.

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
When the effective brain version (`pilot.yaml.brainVersion`, or a cohort override) changes and you push, CI rebuilds the required default/site tags, refreshes generated user env files, and redeploys affected users. An omitted `siteOverride.version` follows that effective version; an explicit exact version remains pinned.
When a push changes only deploy contract files, CI prints `No affected user configs; skipping deploy.` and stops before Kamal.

## Commands

- `brains-ops init <repo>`
- `brains-ops render <repo>` — regenerates `views/users.md` with live DNS, `/health`, and unauthenticated `/mcp` status checks
- `brains-ops user:add <repo> <handle> --cohort <cohort>` — scaffolds a user file, per-user secrets template, and cohort membership
- `brains-ops onboard <repo> <handle>` — creates/seeds the user's content repo with separate admin and sync tokens
- `brains-ops age-key:bootstrap <repo>`
- `brains-ops ssh-key:bootstrap <repo>`
- `brains-ops cert:bootstrap <repo>`
- `brains-ops secrets:encrypt <repo> <handle>`
- `brains-ops reconcile-cohort <repo> <cohort>`
- `brains-ops reconcile-all <repo>`
