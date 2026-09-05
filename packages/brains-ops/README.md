# brains-ops

Operator CLI package for managing pilot brain fleet registry repos.

## Runtime images

The fleet builds one immutable `brain-${brainVersion}` image per effective Brain version. Each image contains the union of exact site and theme package pins used on that version, and conflicting package pins fail before build. Package-set changes require a fresh Brain version.

## Commands

- `brains-ops init <repo>`
- `brains-ops crossover:stage <source-repo> <output-dir> <bundle-review.yaml> [site-pins.yaml]` — creates a separate secret-free capability-bundle review copy without mutating the source; the bundle review must match every explicit source selection, and a reviewed pins file is required when hosted site overrides exist
- `brains-ops render <repo>` — regenerates `views/users.md` and fills status columns from built-in live probes (`DNS`, `/health/ready`, unauthenticated `/mcp`)
- `brains-ops user:add <repo> <handle> --cohort <cohort>` — scaffolds a user file, per-user secrets template, and cohort membership
- `brains-ops onboard <repo> <handle>` — creates/seeds the user's content repo using `CONTENT_REPO_ADMIN_TOKEN` for GitHub repo administration and `GIT_SYNC_TOKEN` for git clone/push
- `brains-ops age-key:bootstrap <repo>`
- `brains-ops ssh-key:bootstrap <repo>`
- `brains-ops cert:bootstrap <repo>`
- `brains-ops secrets:push <repo>`
- `brains-ops secrets:encrypt <repo> <handle>`
- `brains-ops verify-user <repo> <handle>` — checks `/health/operate`, unauthenticated `/mcp`, and site-enabled browser/Studio routes
- `brains-ops recover:retire-legacy-projection-job <database> <job-id> --type <legacy-type> --dry-run` — verifies that one exact pre-scheduler projection job has no owner or partial progress; replace `--dry-run` with `--confirm retire:<job-id>` only after reviewing the result
- `brains-ops stress:directory-sync <repo> <handle> --profile <regression|load|stress> --confirm stress:<handle>` — runs a smoke-only, reversible directory-sync workload and writes structured evidence
- `brains-ops stress:directory-sync:verify-access <repo> <handle> --confirm stress:<handle>` — clones the smoke content repository and verifies push authorization with `git push --dry-run`, without creating a ref or starting a workload
- `brains-ops stress:directory-sync:cleanup <repo> <handle> --confirm stress:<handle>` — idempotently removes residual stress probes
- `brains-ops smoke:health-watchdog <repo> <handle> --confirm watchdog-smoke:<handle> --run-id <id>` — verifies fleet watchdog selection and restart-budget isolation on the smoke host
- `brains-ops smoke:health-watchdog:cleanup <repo> <handle> --confirm watchdog-smoke:<handle> --run-id <id>` — removes deterministic residual watchdog smoke fixtures
- `brains-ops reconcile-cohort <repo> <cohort>`
- `brains-ops reconcile-all <repo>`
- `brains-ops reconcile-all <repo> --dry-run` — reconciles an isolated copy twice with external content-repository access blocked, lists both passes' changed files, and requires second-pass zero drift

`render` owns the observational `views/users.md` projection. Onboard and reconcile commands own generated per-user config and never rewrite live observed status in that view.

## Directory-sync stress profiles

Directory-sync stress is deliberately smoke-only. The handle, domain, and content repository must each identify smoke, and the operator must pass the exact `stress:<handle>` confirmation. The runner refuses production-like targets. The smoke user must also declare the hermetic posture below; reconcile and deploy it before running the workload:

```yaml
embeddingEnabled: false
topicExtractionEnabled: false
skillDerivationEnabled: false
swotDerivationEnabled: false
```

- `regression`: add 20 files, update all 20, then delete them;
- `load`: ramp through 50, 150, and 350 files, update 350, rename 100, update again, then delete all probes;
- `stress`: continue the same deterministic ramp to 700 files and 200 renames.

Each run creates a rollback branch, gates on health failures during the monitored workload window, preserves warmup and cleanup health samples as evidence without poisoning that gate, samples container CPU/memory/PIDs, detects watchdog restarts even when Docker's restart counter remains zero, rejects external AI usage, waits for Git and entity persistence, and always attempts cleanup. JSON, Markdown, runtime logs, and samples are written under `.brains-ops/stress/` unless `--artifacts-dir` is supplied. The scaffolded `Directory Sync Stress` workflow runs a weekly regression and supports manual profiles. Its manual `verify_only` mode exercises the Bitwarden/Varlock content credential path through clone and a dry-run push, skips the workload, and does not schedule cleanup. Workload runs retain a separate `always()` cleanup job. Successful idempotent cleanup also prunes retained stress backup branches; branches remain available when probes remain for recovery. The workflow never deploys or targets a non-smoke user.

## Health watchdog smoke

The scaffolded manual `Health Watchdog Smoke` workflow uses the same pilot desired state, Hetzner lookup, Bitwarden/Varlock deploy key, and `deploy-<handle>` concurrency boundary as fleet deployment. It refuses non-smoke handles/domains and requires `watchdog-smoke:<handle>` confirmation. The runner requires the installed watchdog to match the packaged canonical payload, exercises that installed script, and verifies the deployed image label, active timer, exact selector, liveness healthcheck, diagnostics, negative container isolation, and three-per-hour restart budget without restarting the deployed rover. Evidence is uploaded from `RUNNER_TEMP`; an independent `always()` cleanup job removes deterministic temporary containers and remote files.

## Scope

`brains-ops` lives in the `brains` monorepo and is consumed as a separate package.

The active loader accepts one schema requiring `bundleContract: capability-bundles-v1` and the nine capability/policy bundle IDs. Offline parsing of prior desired state is isolated to `crossover:stage` and is never used by render, verify, or reconciliation paths.

Crossover staging excludes source `.git`, `.operator`, `.brains-ops`, `.turbo`, `dist`, `node_modules`, plaintext `.env`/`.env.local`, and `*.secrets.yaml` artifacts. It generates fresh per-user `.env` selector files in the review copy without copying source secret values. A review manifest must name both sides of the pilot selection and every explicit cohort selection; source drift fails staging:

```yaml
bundleContract: capability-bundles-v1
pilot:
  sourceBundles: [core]
  targetBundles: [core, media, web, chat]
cohorts:
  sites:
    sourceBundles: [core, site, publishing]
    targetBundles:
      [core, media, automation, web, chat, site, publishing, federation]
```

Hosted sites must also be enumerated in a separate reviewed file; staging rejects missing, extra, or identity-mismatched pins instead of inferring versions:

```yaml
sites:
  example:
    package: "@rizom/site-example"
    version: 0.2.0-alpha.1
    theme: "@rizom/theme-example"
    themeVersion: 0.2.0-alpha.1
```

It operates on a separate private data repo, such as `rover-pilot/`, which stores:

- `pilot.yaml`
- `users/*.yaml`
- `cohorts/*.yaml`
- generated `views/users.md`
- generated per-user config under `users/<handle>/brain.yaml`
- generated per-user env selectors under `users/<handle>/.env`
