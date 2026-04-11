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
- Automating cohort provisioning from a central repo
- Building a shared MCP gateway or shared Discord
- Solving scale-to-zero, idle hibernation, or per-user cost optimization
- Cross-brain features (shared discovery, group chats, fleet analytics)
- Perfect operator ergonomics — a checklist is enough for pilot scale
- Self-service onboarding — pilot users do not touch GitHub or CI

## Design

### Deployment model

**Per-user standalone deploys**, using the existing `brain init --deploy` scaffold and nothing else.

Each pilot user gets:

- An operator-owned GitHub repo under a shared org (pilot users are added as Maintainers so they can file issues and view workflow runs, but cannot merge or manage secrets)
- Their own Hetzner CX22 box (~€4-5/month)
- Their own GitHub Actions secrets plus the scaffolded publish-then-deploy workflows
- Their own subdomain under the operator's shared DNS zone
- Their own `brain.yaml` with `preset: core`

This is an operator-run pilot, not a change to the default standalone product contract. The normal public path remains: bring your own repo, bring your own domain, push secrets to GitHub, and deploy your own instance.

Interfaces enabled:

- **MCP over HTTP** — mandatory, this is how the user actually connects their Claude Desktop / Cursor / other MCP client
- **Discord** — optional, off by default; opt-in per user who supplies a bot token
- **A2A** — enabled (rover ships with it) but not surfaced to the user

Because there is no website, the deploy topology is simpler than the `rizom.ai` case:

- One service per box (no host-based routing in kamal-proxy)
- One subdomain → one rover → one MCP endpoint
- No site-production / site-preview volumes
- No site-builder startup build, no lazy rebuild complications
- `brain init --model rover` for pilot/core instances should not scaffold dormant `site.package` / `site.theme` refs into `brain.yaml`

### Baseline choices

These are the locked decisions for cohort 1. Later cohorts may revisit them based on pilot evidence.

| Choice                    | Decision                                                  | Why                                                                                      |
| ------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Discord                   | Off by default, opt-in per user                           | Faster onboarding; users who want it supply their own bot token                          |
| Git sync (directory-sync) | Required for every user                                   | Content persistence is not optional; we learn sync UX from day one                       |
| AI API key                | Shared operator key                                       | Pilot users don't need an AI provider account; operator eats cost under a spend cap      |
| Repo ownership            | Operator-owned, user added as Maintainer                  | Operator controls deploys and secrets; user gets visibility and a handoff path           |
| User identity             | Short operator-assigned handle                            | Clean directory names, secrets names, subdomains; decoupled from GitHub identity         |
| Domain pattern            | `<handle>.rover.example.com` under operator wildcard zone | Future-proof — URL survives the hosted-rover migration, one DNS zone, one wildcard story |

### Registry repo (YAML truth, generated table)

A separate `rover-pilot` repo is created. It is **operator coordination plus lightweight batch input**, not a hosted-rover control plane. Kamal configs, GitHub workflows, deploy secrets, and live `brain.yaml` still live in each user's repo.

Any helper automation for this flow lives as **repo-local scripts inside `rover-pilot`**, not as new public `brain` CLI commands.

Human-editable source of truth should be YAML, not CSV. Operators can review status in a generated Markdown table, but table is derived output, not thing people edit.

```
rover-pilot/
├── cohorts/
│   ├── cohort-1.yaml            # cohort metadata + member handles
│   └── cohort-2.yaml
├── users/
│   ├── alice.yaml               # onboarding input + status
│   ├── alice/
│   │   ├── brain.yaml           # snapshot of deployed config
│   │   └── notes.md             # contact, interfaces enabled, known issues
│   └── bob.yaml
├── views/
│   └── users.md                 # generated table for operator review
├── scripts/
│   ├── render-users-table.ts    # YAML -> Markdown table
│   └── onboard-user.ts          # thin wrapper around per-user init steps
├── docs/
│   ├── onboarding-checklist.md  # step-by-step operator flow
│   └── operator-playbook.md     # known gotchas, recovery procedures
└── README.md
```

Example `users/alice.yaml`:

```yaml
handle: alice
status: pending
repo: rover-alice
contentRepo: rover-alice-content
domain: alice.rover.example.com
preset: core
discord:
  enabled: false
notes: close collaborator
```

Why this shape:

- YAML easy for humans to edit and diff
- per-user files avoid one giant merge-conflict magnet
- generated Markdown gives "table" view without making Markdown or CSV source of truth
- future operator tooling can read same files without turning them into live deploy state
- helper automation stays private to pilot operations instead of expanding product CLI surface

The repo exists so that:

- Audit is possible — "what was this user's onboarding input and deployed config"
- Drift is detectable — compare snapshot to live repo if something breaks
- Cohorts can be reviewed as whole
- Future hosted-rover can import real configs as test cases

### Per-user onboarding flow

Fits on one page of `onboarding-checklist.md`. If it doesn't fit, scaffold absorbed something it shouldn't have.

Manual truth entry first:

1. Operator agrees a short handle with new user (e.g. `alice`)
2. Operator creates `rover-pilot/users/<handle>.yaml`
3. Operator adds handle to active cohort YAML
4. Operator regenerates `views/users.md` so batch state is visible as table

Per-user repo/deploy flow after that:

5. Operator creates new repo in pilot org (`<org>/rover-<handle>`)
6. Operator creates content repo in pilot org (`<org>/rover-<handle>-content`) for directory-sync
7. Adds pilot user as Maintainer on both repos
8. Runs `brain init --deploy --model rover --domain <handle>.rover.example.com`
9. Configures `brain.yaml` with `preset: core` and directory-sync pointed at content repo
10. Fills `.env.local` with local operator inputs CLI expects: `AI_API_KEY`, `GIT_SYNC_TOKEN`, `HCLOUD_TOKEN`, `HCLOUD_SSH_KEY_NAME`, `HCLOUD_SERVER_TYPE`, `HCLOUD_LOCATION`, `KAMAL_REGISTRY_PASSWORD`, `CF_API_TOKEN`, `CF_ZONE_ID`, `KAMAL_SSH_PRIVATE_KEY_FILE`, plus optional `MCP_AUTH_TOKEN` / `DISCORD_BOT_TOKEN`
11. Runs `brain ssh-key:bootstrap --push-to gh`
12. Runs `brain secrets:push --push-to gh`
13. Runs `brain cert:bootstrap --push-to gh`, then deletes local `origin.pem` / `origin.key`
14. Merges to `main`; `Publish Image` then `Deploy` run
15. Verifies MCP endpoint reachable and basic tool call works
16. Hands over MCP connection details to user
17. Copies deployed `brain.yaml` into `rover-pilot/users/<handle>/` as snapshot and writes `notes.md`
18. Updates `users/<handle>.yaml` status to `onboarded` and regenerates `views/users.md`

### Cohort structure

Cohorts are **temporal batches**, not infrastructure batches. All cohorts share the same per-user-deploy model; they differ only in pacing.

- **Cohort 1** — 2-3 users, preferably the operator plus 1-2 close collaborators who can tolerate rough edges. Goal: shake out the onboarding flow and the scaffold itself.
- **Cohort 2** — 5-7 users, only after cohort 1 is stable and the operator playbook has been updated with whatever cohort 1 surfaced.
- **Cohort 3** — 10+ users, only if cohort 2 did not surface structural problems.

Pause between cohorts. A cohort is not "done" until its members have been running rover for at least two weeks without operator intervention. Use the pause to integrate feedback, fix scaffold bugs, and update the playbook.

## Shared-zone contract

The current deploy scaffold already matches the pilot's operator-managed DNS model. No pilot-specific DNS or cert rewiring is required.

Concrete contract:

- `brain.yaml` stores the full FQDN: `<handle>.rover.example.com`
- `CF_ZONE_ID` and `CF_API_TOKEN` point at the operator's shared Cloudflare zone, not a per-user zone
- the scaffolded deploy workflow upserts both `<handle>.rover.example.com` and `preview.<handle>.rover.example.com` in that zone
- `brain cert:bootstrap --push-to gh` issues an Origin CA cert for `[domain, *.domain]`, so `preview.<domain>` is covered automatically
- per-user repos still publish their own image and deploy their own server; only DNS zone ownership is shared

The one thing to prove before cohort 1 is a live throwaway rover repo using the shared zone. If that fails, fix the scaffold in `brain init`. If it succeeds, treat the shared-zone path as already productized enough for the pilot.

## Known pilot-scale risks

The pilot deliberately centralizes several things that do not scale past the pilot. Call them out so they don't become load-bearing assumptions:

- **Shared AI key** — one abusive or runaway user can burn the shared budget. Mitigations: upstream provider spend cap, monthly cost review, ceiling decision on when shared stops working (probably around cohort 3).
- **Shared DNS zone** — all pilot users depend on the operator's zone being healthy. Mitigations: Cloudflare SLA is fine; document the zone ownership in the registry repo.
- **Operator-owned repos** — all pilot state is concentrated in the operator's GitHub org. Mitigations: none needed at pilot scale; this is the whole point of "operator manages pilot".
- **Shared operator bottleneck** — only the operator can onboard new users, fix broken deploys, or rotate secrets. Mitigations: none; pilot is not trying to scale operator effort.

None of these are problems for cohort scale. They become problems when the pilot starts competing with hosted rover for the same users, which is what the exit criteria below address.

## What to measure

Per cohort, track in the cohort doc:

- **Setup time** — wall-clock from "let's onboard them" to "they're using it"
- **Breakages** — scaffold bugs, deploy failures, MCP/Discord misconfigs, cert issues, sharp/native-module surprises
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

- [ ] Register the pilot DNS zone (`rover.example.com` or chosen name) in Cloudflare
- [ ] Create a pilot GitHub org to hold per-user repos (or pick an existing one)
- [ ] Validate one throwaway rover repo end-to-end against the shared-zone contract
- [ ] Create the `rover-pilot` registry repo with the structure defined in Design
- [ ] Define Zod-validated schema for `users/*.yaml` and `cohorts/*.yaml`
- [ ] Add repo-local `render-users-table` script so operators get table view from YAML truth
- [ ] Add repo-local `onboard-user` wrapper around per-user init flow
- [ ] Write `docs/onboarding-checklist.md` — the per-user step list
- [ ] Write `docs/operator-playbook.md` — known gotchas (TLS, secrets, sharp/libstdc++, `/opt/brain-dist` volume, scaffold quirks)
- [ ] Set the shared AI provider spend cap and document the ceiling
- [ ] Pick cohort 1 users
- [ ] Provision cohort 1
- [ ] After 2 weeks, review cohort 1; update playbook; decide whether to proceed to cohort 2

## Relationship to other plans

This plan is the **step before** `docs/plans/hosted-rovers.md`. The hosted-rover plan's validity depends on operational data from real users; the pilot generates that data.

This plan depends on the standalone publish/deploy contract from `docs/plans/standalone-image-publish-contract.md`. That contract is now in place; remaining pilot-specific proof is a real shared-zone rover onboarding run plus the repo-local operator tooling around the YAML registry.

This plan **does not block** hosted-rover work from starting; it runs in parallel. But concrete architecture decisions for hosted-rover should wait on cohort 1-2 evidence.

## Related

- `docs/plans/hosted-rovers.md` — long-term destination
- `docs/plans/standalone-apps.md` — the per-user standalone deploy model this plan relies on
- `docs/plans/standalone-image-publish-contract.md` — image contract the scaffold needs to respect
