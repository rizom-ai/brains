# Plan: Rover Pilot Onboarding

## Context

Rover core is the minimal rover preset: MCP + Discord + capture plugins (note, link, topics, wishlist, directory-sync), with **no website, no site-builder, no content pipeline**. It's the smallest useful slice of rover we can put in front of real users.

We want to onboard people to rover core gradually, to learn what hosted rover actually needs to solve before we build it. The existing `docs/plans/hosted-rovers.md` targets a Kubernetes-based scale-to-zero platform; that's the long-term destination. This plan is the step before that — running real rovers for real users using only existing tools.

## Goal

Put rover core in front of ~10-20 pilot users, gather operational and UX data, and inform hosted-rover architecture decisions with actual evidence.

Specifically:

- Prove rover core is useful enough to keep using
- Learn which MCP/Discord/git-sync flows are rough edges
- Discover which operational problems actually bite vs. which we imagined
- Establish an operator playbook that can later be codified into automation

## Non-goals

- Building new deployment infrastructure
- Running multiple rovers on shared hardware (that's hosted-rover)
- Building a shared MCP gateway or shared Discord
- Solving scale-to-zero, idle hibernation, or per-user cost optimization
- Cross-brain features (shared discovery, group chats, fleet analytics)
- Perfect operator ergonomics — a checklist is enough for pilot scale
- Self-service onboarding — pilot users do not touch GitHub or CI
- Per-user brain repos — all deploy config lives in one operator repo

## Design

### Deployment model

**Monorepo with per-user deploys.** One operator-owned `rover-pilot` repo in `rizom-ai` contains all user configs, deploy infrastructure, and CI workflows. Each pilot user gets their own Hetzner box, but everything is managed from this single repo.

Each pilot user gets:

- Their own Hetzner CX22 box (~€4/month)
- Their own content repo (`rover-<handle>-content`) in `rizom-ai` for directory-sync
- Their own subdomain under `rizom.ai` (`<handle>.rizom.ai`)
- Their own `brain.yaml` inside the monorepo at `users/<handle>/brain.yaml`
- Their own GitHub secrets in the monorepo (namespaced by handle)

Users do not get access to `rover-pilot`. This is an operator-managed repo. Users interact with their rover via MCP and optionally Discord.

Interfaces enabled:

- **MCP over HTTP** — mandatory, this is how the user connects their Claude Desktop / Cursor / other MCP client
- **Discord** — optional, off by default; opt-in per user who supplies a bot token
- **A2A** — enabled (rover ships with it) but not surfaced to the user

Because there is no website, the deploy topology is simpler than the `rizom.ai` case:

- One service per box (no host-based routing in kamal-proxy)
- One subdomain → one rover → one MCP endpoint
- No site-production / site-preview volumes
- No site-builder startup build, no lazy rebuild complications
- `brain init --model rover` for pilot/core instances should not scaffold dormant `site.package` / `site.theme` refs into `brain.yaml`

### Monorepo rationale

Per-user repos were considered and rejected. At pilot scale the operational overhead of syncing CI workflows, Kamal configs, and version bumps across 10-20 repos outweighs the isolation benefit. Specifically:

- **CI drift** — a workflow bug fix must be pushed to every repo individually; with a monorepo it's one commit
- **Fleet operations** — version bumps, config changes, and reconciliation are single-repo operations
- **Onboarding** — adding a user is "add files + push", not "create repo, scaffold, push secrets, configure"

Tradeoffs accepted:

- All user secrets live in one repo's GitHub secrets namespace (namespaced by handle, e.g. `ALICE_DISCORD_TOKEN`). GitHub caps at 100 repo secrets; fine for 20 users.
- No clean repo handoff if a user graduates to self-hosted. At pilot scale this is extraction, not transfer. Acceptable — pilot users are not self-hosting.
- Deploy workflows need per-user dispatch or matrix strategy. Solvable with Kamal's multi-destination support.

### Baseline choices

These are the locked decisions for cohort 1. Later cohorts may revisit them based on pilot evidence.

| Choice                    | Decision                                            | Why                                                                                 |
| ------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Discord                   | Off by default, opt-in per user                     | Faster onboarding; users who want it supply their own bot token                     |
| Git sync (directory-sync) | Required for every user                             | Content persistence is not optional; we learn sync UX from day one                  |
| AI API key                | Shared operator key, overridable per cohort or user | Pilot users don't need an AI provider account; operator eats cost under a spend cap |
| Repo model                | Single monorepo, per-user content repos only        | Operator controls deploys and CI centrally; no workflow drift                       |
| User identity             | Short operator-assigned handle                      | Clean directory names, secret names, subdomains; decoupled from GitHub identity     |
| Domain pattern            | `<handle>.rizom.ai` under existing Cloudflare zone  | No new DNS zone needed; clean URL; survives hosted-rover migration                  |

### Monorepo structure

```
rover-pilot/
├── pilot.yaml                   # fleet defaults + naming conventions
├── cohorts/
│   ├── cohort-1.yaml            # active rollout group membership
│   └── cohort-2.yaml
├── users/
│   ├── alice.yaml               # desired onboarding input
│   ├── alice/
│   │   ├── brain.yaml           # deployed config (generated, not hand-edited)
│   │   ├── .env                 # non-secret env vars (generated)
│   │   └── notes.md             # human operator notes
│   └── bob.yaml
├── .env.schema                  # shared instance env contract for deploy workflow
├── deploy/
│   ├── kamal/                   # shared Kamal config with per-user destinations
│   └── scripts/                 # shared deploy helpers consumed by CI
├── .github/
│   └── workflows/               # shared CI: build image, deploy per-user
├── views/
│   └── users.md                 # generated table for operator review
├── docs/
│   ├── onboarding-checklist.md  # step-by-step operator flow
│   └── operator-playbook.md     # known gotchas, recovery procedures
└── README.md

rizom-ai/ (GitHub org)
├── rover-pilot                  # this repo
├── rover-alice-content          # per-user content repo for directory-sync
├── rover-bob-content
└── ...
```

Any helper automation for this flow lives in **`brains-ops`** as a separate operator CLI/package, not as new public `brain` CLI commands.

### Data contract

`pilot.yaml` defines shared naming, fleet defaults, and schema versioning. Minimum fields:

- `schemaVersion` — registry schema version
- `brainVersion` — exact pinned `@rizom/brain` version for whole pilot
- `model` — fleet-wide brain model, initially `rover`
- `githubOrg` — GitHub org (initially `rizom-ai`)
- `contentRepoPrefix` — prepended to each handle for content repo names
- `domainSuffix` — appended to handle for public FQDN
- `preset` — default fleet preset, from enum `core | default | pro`
- `aiApiKey` — secret name for the shared AI key (not the key itself)

`users/*.yaml` is the human-edited desired state. Minimum fields:

- `handle` — lowercase slug, unique across pilot
- required `discord.enabled` — boolean intent flag
- optional `aiApiKeyOverride` — secret name for a per-user AI key override

Non-secret integration intent belongs in YAML. Secret material does not.

Derived fields, not stored per user:

- `contentRepo = ${contentRepoPrefix}${handle}-content`
- `domain = ${handle}${domainSuffix}`
- `model = pilot.yaml.model`
- `preset = cohort.presetOverride ?? pilot.yaml.preset`
- `effectiveAiApiKey = user.aiApiKeyOverride ?? cohort.aiApiKeyOverride ?? pilot.yaml.aiApiKey`
- Discord secret name, when enabled: `DISCORD_BOT_TOKEN_${HANDLE_UPPER}`

No separate `state/*.yaml` is introduced in cohort 1. Operator tooling should be idempotent enough that current state can be derived from the world instead of persisted as another mutable file.

`cohorts/*.yaml` is the set of active rollout groups plus optional rollout overrides. The cohort id is the file name only; there is no `id` or `title` field in the YAML body. Minimum fields:

- `members` — non-empty set of user handles
- optional `brainVersionOverride` — exact pinned version
- optional `presetOverride` — preset lane override from enum `core | default | pro`
- optional `aiApiKeyOverride` — secret name for a cohort-level AI key override

Cohorts are always active rollout groups. Historical rollout reporting lives somewhere else; it is not part of this config resolution schema.

Effective version resolution:

1. `cohort.brainVersionOverride`
2. else `pilot.yaml.brainVersion`

Effective preset resolution:

1. `cohort.presetOverride`
2. else `pilot.yaml.preset`

Effective AI key resolution:

1. `user.aiApiKeyOverride`
2. else `cohort.aiApiKeyOverride`
3. else `pilot.yaml.aiApiKey`

Validation rules:

- user file name must match `handle` (`users/alice.yaml` -> `handle: alice`)
- cohort identity comes from the cohort file name only (`cohorts/cohort-1.yaml` -> `cohort-1`)
- cohort members must reference existing user files
- duplicate handles are invalid
- derived `contentRepo` and `domain` must be deterministic from `pilot.yaml` + `handle`
- if `discord.enabled: true`, operator tooling expects a secret named `DISCORD_BOT_TOKEN_${HANDLE_UPPER}`
- every user must belong to **exactly one** cohort
- cohort membership lives only in `cohorts/*.yaml`, never duplicated on user files
- each cohort must contain at least one member
- duplicate members in a cohort are invalid
- member order is not semantically meaningful
- `brainVersion` and `brainVersionOverride` must be exact pinned versions, not ranges or moving tags
- `model` is fleet-wide and comes only from `pilot.yaml`
- `preset` may come from `pilot.yaml` or `cohort.presetOverride`, never from `users/*.yaml`
- `preset` and `presetOverride` must be one of `core`, `default`, or `pro`
- desired state must be replay-safe: rerunning onboarding for an existing user should converge on same deploy shape instead of requiring a handwritten checkpoint file

### Exact file contract

The `rover-pilot` repo validates these files with Zod and treats them as the only human-edited machine inputs:

`pilot.yaml`

```yaml
schemaVersion: 1
brainVersion: 0.1.1-alpha.14
model: rover
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
preset: core
aiApiKey: AI_API_KEY
```

Rules:

- exactly one file at repo root
- `schemaVersion` is an integer, initially locked to `1`
- `brainVersion` is an exact pinned `@rizom/brain` version string
- `model` is a required fleet-wide model string, initially locked to `rover`
- `contentRepoPrefix` and `domainSuffix` are non-empty strings
- `preset` is a required fleet default preset from enum `core | default | pro`
- `aiApiKey` is a required secret name (not the secret itself)

`users/<handle>.yaml`

```yaml
handle: alice
discord:
  enabled: false
```

Rules:

- file path is authoritative for `handle`
- body must not contain derived fields like `contentRepo`, `domain`, or `cohort`
- body must not contain secrets or secret names (except `aiApiKeyOverride` which is a secret name reference)
- `discord.enabled` is required for every user

`cohorts/<cohort>.yaml`

```yaml
members:
  - alice
  - bob
brainVersionOverride: 0.1.1-alpha.14
presetOverride: default
```

Rules:

- file path is authoritative for cohort id
- `members` is required, non-empty, unique, and references existing users
- `brainVersionOverride` is optional and, when present, is an exact pinned version
- `presetOverride` is optional and, when present, overrides `pilot.yaml.preset` for the whole cohort
- `presetOverride` must be from enum `core | default | pro`
- `aiApiKeyOverride` is optional and, when present, overrides the AI key for the whole cohort
- no other override fields are allowed

Scaffolded-but-operator-owned files:

- `.env.schema`
  - shared secret/env contract for the pilot deploy workflow
  - the single source of truth for required and sensitive deploy vars
  - checked in once at repo root
  - consumed by deploy helpers and workflow validation
- `deploy/scripts/*`
  - checked-in helper scripts used by the scaffolded deploy workflow
  - includes config resolution plus shared Hetzner / Cloudflare / Kamal helper entrypoints
  - copied from the monorepo scaffold, then versioned in the pilot repo like the rest of the deploy contract

Derived-but-checked files:

- `views/users.md`
  - generated only; never hand-edited
  - one row per user
  - minimum columns: `handle`, `cohort`, `model`, `preset`, `brainVersion`, `domain`, `contentRepo`, `discord`, `serverStatus`, `deployStatus`, `dnsStatus`, `mcpStatus`
- `users/<handle>/brain.yaml`
  - generated deployed config
  - overwritten on successful onboarding/reconcile
- `users/<handle>/.env`
  - generated non-secret env vars
  - includes at least `BRAIN_VERSION`, secret selector names, and `CONTENT_REPO`
  - overwritten on successful onboarding/reconcile
- `users/<handle>/notes.md`
  - human notes only
  - ignored by config resolution

### Tool/package contract

`brains-ops` owns the machine logic for the YAML truth and the deploy lifecycle. The `rover-pilot` repo owns the data.

Delivery contract:

- `brains-ops` is delivered as a published package artifact: `@brains/ops`
- it remains separate from the public `brain` CLI surface
- the published package should follow the same packaging posture as `@rizom/brain`: built JS in `dist/`, published from build output, not from monorepo-only source entrypoints
- the published package must not rely on private workspace runtime dependencies
- `rover-pilot` CI installs an exact pinned `@brains/ops` version before running reconcile/onboard flows
- operator laptops may run the same pinned package locally
- workflow reproducibility comes from the pinned package version, not from checking out `rizom-ai/brains` at runtime

- `brains-ops init <repo>`
  - creates the `rover-pilot` repo skeleton when missing
  - writes starter files for `pilot.yaml`, `.env.schema`, `cohorts/`, `users/`, `deploy/`, `views/`, and operator docs
  - scaffolds shared GitHub Actions workflows, Kamal config, and deploy helper scripts
  - preserves existing human-edited files on rerun
  - exits non-zero if the target path cannot be prepared
- `brains-ops render <repo>`
  - inputs: `pilot.yaml`, every `users/*.yaml`, every `cohorts/*.yaml`
  - validates via Zod before rendering anything
  - writes only `views/users.md`
  - derives status columns from observable facts (server existence, deploy state, DNS, MCP reachability, expected Discord secret presence)
  - exits non-zero on missing users / duplicate handles / zero-cohort membership / multi-cohort membership / empty cohorts / duplicate cohort members / invalid schema
- `brains-ops onboard <repo> <handle>`
  - input: one existing handle from `users/<handle>.yaml`
  - resolves effective version, preset, and AI key from user/cohort/pilot config
  - creates content repo in GitHub org if missing
  - provisions Hetzner server if missing
  - configures DNS (`<handle>.rizom.ai`) in existing Cloudflare zone
  - generates `users/<handle>/brain.yaml` and `users/<handle>/.env`
  - pushes per-user secrets to monorepo's GitHub secrets (namespaced by handle)
  - deploys to the user's server via Kamal
  - verifies MCP endpoint is reachable
  - regenerates `views/users.md`
  - exits non-zero if required observable prerequisites are missing after reconcile
- `brains-ops reconcile-cohort <repo> <cohort>`
  - input: one existing cohort id from file name
  - resolves that cohort's members plus effective version, preset, and AI key
  - runs `onboard` semantics for each member in the cohort
  - updates affected generated files plus `views/users.md`
  - exits non-zero if any member fails reconciliation
- `brains-ops reconcile-all <repo>`
  - inputs: whole repo config set
  - walks all users exactly once
  - reconciles each user to their effective desired version, model, preset, and AI key
  - supports fleet-wide update when `pilot.yaml.brainVersion`, `pilot.yaml.model`, or `pilot.yaml.preset` changes
  - still respects cohort and user overrides when present
  - updates all affected generated files plus `views/users.md`
  - exits non-zero if any user fails reconciliation

Why this shape:

- YAML easy for humans to edit and diff
- per-user files avoid one giant merge-conflict magnet
- generated Markdown gives "table" view without making Markdown or CSV source of truth
- separate `brains-ops` package gives brain-cli-like structure without expanding public product surface
- monorepo keeps all deploy config, CI, and Kamal in one place — no workflow drift
- content repos stay per-user because directory-sync needs them
- future operator tooling can read same files without turning them into live deploy state

The repo exists so that:

- Audit is possible — "what was this user's onboarding input and deployed config"
- Drift is detectable — compare generated brain.yaml to live deploy
- Cohorts can be reviewed as a whole
- CI and deploy changes apply to all users atomically
- Future hosted-rover can import real configs as test cases

### Per-user onboarding flow

Fits on one page of `onboarding-checklist.md`. If it doesn't fit, the monorepo absorbed something it shouldn't have.

Manual truth entry first:

1. Operator agrees a short handle with new user (e.g. `alice`)
2. Operator creates `rover-pilot/users/<handle>.yaml`
3. Operator adds handle to active cohort YAML
4. Operator runs `brains-ops render <repo>` so fleet state is visible as table

Automated per-user provisioning after that:

5. Operator runs `brains-ops onboard <repo> <handle>`, which:
   - Creates content repo `rover-<handle>-content` in `rizom-ai` (if missing)
   - Provisions Hetzner CX22 server (if missing)
   - Configures DNS: `<handle>.rizom.ai` → server IP in existing Cloudflare zone
   - Generates `users/<handle>/brain.yaml` with effective preset, model, directory-sync config
   - Pushes secrets to monorepo GitHub secrets: `AI_API_KEY` (shared or overridden), `GIT_SYNC_TOKEN_<HANDLE_UPPER>`, `MCP_AUTH_TOKEN_<HANDLE_UPPER>`, plus `DISCORD_BOT_TOKEN_<HANDLE_UPPER>` when enabled
   - Bootstraps SSH key and origin cert for the server
   - Deploys via Kamal to the user's server
   - Verifies MCP endpoint reachable
   - Regenerates `views/users.md`
6. For fleet version bumps, operator edits `pilot.yaml.brainVersion` and pushes once; CI rebuilds the shared image, refreshes generated user env files, and redeploys affected users.
7. Operator writes `users/<handle>/notes.md` with any onboarding context
8. Operator hands over MCP connection details to user

### Cohort structure

Cohorts are **temporal batches**, not infrastructure batches. All cohorts share the same monorepo deploy model; they differ only in pacing and optional config overrides.

- **Cohort 1** — up to 5 users, added gradually. Preferably the operator plus close collaborators who can tolerate rough edges. Goal: shake out the onboarding flow and the monorepo deploy model.
- **Cohort 2** — 5-7 users, only after cohort 1 is stable and the operator playbook has been updated with whatever cohort 1 surfaced.
- **Cohort 3** — 10+ users, only if cohort 2 did not surface structural problems.

Pause between cohorts. A cohort is not "done" until its members have been running rover for at least two weeks without operator intervention. Use the pause to integrate feedback, fix scaffold bugs, and update the playbook.

## DNS contract

The pilot uses the existing `rizom.ai` Cloudflare zone. No new DNS zone is needed.

Concrete contract:

- `brain.yaml` stores the full FQDN: `<handle>.rizom.ai`
- `CF_ZONE_ID` and `CF_API_TOKEN` point at the existing `rizom.ai` Cloudflare zone
- the deploy workflow upserts `<handle>.rizom.ai` in that zone
- origin cert covers `[<handle>.rizom.ai, *.<handle>.rizom.ai]`
- per-user servers still run their own rover instance; only DNS zone ownership is shared

## CI/deploy contract

One set of GitHub Actions workflows in `rover-pilot/.github/workflows/` manages all users.

- **Build workflow** — builds one Docker image per `@rizom/brain` version. Tagged as `brain-${brainVersion}`, not by user. All users on the same version share the same image.
- **Deploy workflow** — runs per affected user. It supports manual dispatch for one handle, and automatic push-triggered deploys when generated `users/<handle>/.env` or `users/<handle>/brain.yaml` files change. It installs pinned `@brains/ops`, reconciles or resolves the selected user config, validates secrets against `.env.schema` as the checked-in single source of truth, waits for the shared image tag to exist when needed, and deploys to the user's server via Kamal. Generated config commits happen once in a final aggregation step after the matrix finishes; matrix jobs do not race to push.
- **Reconcile workflow** — triggered on push to `pilot.yaml` or `cohorts/*.yaml`. Installs pinned `@brains/ops` and runs `brains-ops reconcile-all` to converge all users to desired state.

Operator tool delivery in CI:

- `rover-pilot` declares an exact `@brains/ops` version in its package metadata
- workflows install dependencies normally with Bun
- workflows invoke `brains-ops` via the installed package, not by checking out the `brains` monorepo
- upgrading operator behavior in `rover-pilot` is a normal dependency bump PR/commit

Why this is the contract:

- published artifact is a clean delivery mechanism for CI
- exact package version gives reproducibility without bespoke monorepo checkout logic
- `brains-ops` remains a separate operator tool instead of leaking into `brain`
- the private repo stays focused on data, generated outputs, and deploy state

Shared image tag contract:

- build publishes `ghcr.io/<owner>/<repo>:brain-${brainVersion}`
- generated `users/<handle>/.env` carries `BRAIN_VERSION=<brainVersion>`
- deploy sets `VERSION=brain-${brainVersion}`
- pilot deploys do not introduce a second per-user or per-commit image identity
- when `pilot.yaml.brainVersion` changes, the intended chain is:
  1. build publishes the new shared image tag
  2. reconcile refreshes generated `users/<handle>/.env`
  3. deploy runs for users whose generated config changed and converges them to the new shared tag

Kamal config uses per-user destinations derived from the registry YAML. Each destination targets a different server with the user's brain.yaml and env.

## Known pilot-scale risks

The pilot deliberately centralizes several things that do not scale past the pilot. Call them out so they don't become load-bearing assumptions:

- **Shared AI key** — one abusive or runaway user can burn the shared budget. Mitigations: upstream provider spend cap, monthly cost review, ceiling decision on when shared stops working. Per-cohort and per-user override available when needed.
- **Shared DNS zone** — all pilot users depend on the `rizom.ai` zone being healthy. Mitigations: Cloudflare SLA is fine; operator already manages this zone.
- **Monorepo secrets density** — all user secrets in one repo's GitHub secrets namespace. Mitigations: namespaced by handle; GitHub allows 100 repo secrets, sufficient for 20 users.
- **Shared operator bottleneck** — only the operator can onboard new users, fix broken deploys, or rotate secrets. Mitigations: none; pilot is not trying to scale operator effort.

None of these are problems for cohort scale. They become problems when the pilot starts competing with hosted rover for the same users, which is what the exit criteria below address.

## What to measure

Per cohort, track in the cohort doc:

- **Setup time** — wall-clock from "let's onboard them" to "they're using it"
- **Breakages** — deploy failures, MCP/Discord misconfigs, cert issues, sharp/native-module surprises
- **User pain points** — what do they complain about; what do they actually use
- **Operator pain points** — what's tedious to repeat, what needs automation
- **Cost** — real Hetzner + DNS spend per user, plus the shared AI bill total
- **Failure modes** — box OOM, container crash loops, drift, TLS expiry surprises, git sync conflicts

Feed these into hosted-rover architecture decisions. The goal of the pilot is to replace speculation in `hosted-rovers.md` with evidence.

## Exit criteria

Hand off to hosted rover (or to whatever hosted-rover becomes after the pilot informs it) when any of these fire:

- Onboarding pace exceeds ~30 users — per-user cost and operator toil start to dominate
- Shared AI key cost exceeds the ceiling the operator set
- A pattern of cross-brain features emerges that pilot users are asking for and standalone deploys cannot serve
- The operator playbook has stabilized enough to be codified into the hosted-rover onboarding flow
- A pilot-breaking issue is found that requires shared infrastructure to fix

Until one of those fires: stay on per-user deploys.

## Implementation checklist (one-time setup)

- [ ] Validate one throwaway rover deploy against `rizom.ai` zone using existing Cloudflare config
- [ ] Create the `rover-pilot` monorepo in `rizom-ai` with the structure defined in Design
- [x] Define Zod-validated schema for `users/*.yaml` and `cohorts/*.yaml`
- [x] Add monorepo-owned `brains-ops init <repo>` to scaffold the pilot repo
- [x] Add monorepo-owned `brains-ops render <repo>` so operators get table view from YAML truth
- [x] Add monorepo-owned `brains-ops onboard <repo> <handle>` wrapper around per-user provisioning
- [x] Add monorepo-owned `brains-ops reconcile-cohort <repo> <cohort>` for staged rollout of one active cohort
- [x] Add monorepo-owned `brains-ops reconcile-all <repo>` for fleet-wide convergence
- [x] Write `docs/onboarding-checklist.md` in the pilot repo scaffold
- [x] Write `docs/operator-playbook.md` in the pilot repo scaffold
- [x] Scaffold shared GitHub Actions workflows (build, deploy, reconcile) in `brains-ops init`
- [x] Scaffold `rover-pilot` package metadata so CI can install pinned `@brains/ops`
- [x] Scaffold shared Kamal config with per-user destination support in `brains-ops init`
- [x] Scaffold shared pilot deploy env contract and helper scripts in `brains-ops init`
- [ ] Set the shared AI provider spend cap and document the ceiling
- [ ] Pick cohort 1 users (up to 5)
- [ ] Provision cohort 1 gradually
- [ ] After 2 weeks, review cohort 1; update playbook; decide whether to proceed to cohort 2

## Relationship to other plans

This plan is the **step before** `docs/plans/hosted-rovers.md`. The hosted-rover plan's validity depends on operational data from real users; the pilot generates that data.

This plan depends on the standalone repo deploy model described in `docs/plans/standalone-apps.md`. Remaining pilot-specific work is a real `rizom.ai` subdomain rover deploy plus live operator use of the monorepo-owned `brains-ops` workflow.

This plan **does not block** hosted-rover work from starting; it runs in parallel. But concrete architecture decisions for hosted-rover should wait on cohort 1-2 evidence.

## Related

- `docs/plans/hosted-rovers.md` — long-term destination
- `docs/plans/standalone-apps.md` — the per-user standalone deploy model this plan builds on
