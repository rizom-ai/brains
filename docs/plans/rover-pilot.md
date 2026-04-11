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
- Their own GitHub Actions secrets and Kamal deployment
- Their own subdomain under the operator's shared DNS zone
- Their own `brain.yaml` with `preset: core`

Interfaces enabled:

- **MCP over HTTP** — mandatory, this is how the user actually connects their Claude Desktop / Cursor / other MCP client
- **Discord** — optional, off by default; opt-in per user who supplies a bot token
- **A2A** — enabled (rover ships with it) but not surfaced to the user

Because there is no website, the deploy topology is simpler than the `rizom.ai` case:

- One service per box (no host-based routing in kamal-proxy)
- One subdomain → one rover → one MCP endpoint
- No site-production / site-preview volumes
- No site-builder startup build, no lazy rebuild complications

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

### Registry repo (coordination only)

A separate `rover-pilot` repo is created, but it is **documentation and tracking, not orchestration**. No Kamal configs, no workflows, no deploy logic. The `brain.yaml` files in it are _snapshots_ of what was deployed, not live inputs.

```
rover-pilot/
├── cohorts/
│   ├── cohort-1.md              # target size, members, status, open issues
│   └── cohort-2.md
├── users/
│   ├── alice/
│   │   ├── brain.yaml           # snapshot of deployed config
│   │   └── notes.md             # contact, interfaces enabled, known issues
│   └── bob/
│       └── ...
├── docs/
│   ├── onboarding-checklist.md  # step-by-step operator flow
│   └── operator-playbook.md     # known gotchas, recovery procedures
└── README.md
```

The repo exists so that:

- Audit is possible — "what was this user's config when we deployed them"
- Drift is detectable — compare the snapshot to the live repo if something breaks
- Cohorts can be reviewed as a whole
- Future hosted-rover can import real configs as test cases

### Per-user onboarding flow

Fits on one page of `onboarding-checklist.md`. If it doesn't fit, the scaffold absorbed something it shouldn't have.

1. Operator agrees a short handle with the new user (e.g. `alice`)
2. Operator creates a new repo in the pilot org (`<org>/rover-<handle>`)
3. Operator creates a content repo in the pilot org (`<org>/rover-<handle>-content`) for directory-sync
4. Adds the pilot user as Maintainer on both repos
5. Runs `brain init --deploy --model rover` with `preset: core` and directory-sync configured to the content repo
6. Configures secrets: `AI_API_KEY` (shared operator key), `GIT_SYNC_TOKEN`, plus `DISCORD_BOT_TOKEN` if the user opted in
7. Runs `brain ssh-key:bootstrap --push-to gh`
8. Runs `brain secrets:push --push-to gh`
9. Upserts `<handle>.rover.example.com` DNS record against the operator's Cloudflare zone (automated by the scaffold workflow — see "Scaffold changes required")
10. Merges the scaffolded workflows to `main`; deploy workflow runs
11. Verifies MCP endpoint reachable + a basic tool call works
12. Hands over MCP connection details to the user
13. Copies `brain.yaml` into `rover-pilot/users/<handle>/` as a snapshot and writes `notes.md`
14. Adds user to the current cohort doc with status `onboarded`

### Cohort structure

Cohorts are **temporal batches**, not infrastructure batches. All cohorts share the same per-user-deploy model; they differ only in pacing.

- **Cohort 1** — 2-3 users, preferably the operator plus 1-2 close collaborators who can tolerate rough edges. Goal: shake out the onboarding flow and the scaffold itself.
- **Cohort 2** — 5-7 users, only after cohort 1 is stable and the operator playbook has been updated with whatever cohort 1 surfaced.
- **Cohort 3** — 10+ users, only if cohort 2 did not surface structural problems.

Pause between cohorts. A cohort is not "done" until its members have been running rover for at least two weeks without operator intervention. Use the pause to integrate feedback, fix scaffold bugs, and update the playbook.

## Scaffold changes required

The existing `brain init --deploy` scaffold assumes the user supplies their own top-level domain and owns the Cloudflare zone. For the pilot, subdomains live under the operator's shared zone. Concrete changes:

- The deploy workflow's Cloudflare DNS upsert step needs to target the operator's shared zone (`rover.example.com`) and upsert `<handle>.rover.example.com` as an A record pointing at the provisioned Hetzner box
- `brain.yaml`'s domain field stores the full FQDN (`<handle>.rover.example.com`), same as today
- Cloudflare Origin CA cert issuance needs to issue for the full hostname under the shared zone — same flow as today, just a different zone
- `CF_ZONE_ID` becomes a pilot-wide secret (the operator's shared zone) rather than a per-user value

These are minor adjustments to existing scaffold steps, not new infrastructure. Scope them into the first onboarding run for cohort 1 and keep the changes in the main scaffold so later cohorts benefit.

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
- [ ] Apply the scaffold changes in "Scaffold changes required" (DNS zone rewiring)
- [ ] Create the `rover-pilot` registry repo with the structure defined in Design
- [ ] Write `docs/onboarding-checklist.md` — the per-user step list
- [ ] Write `docs/operator-playbook.md` — known gotchas (TLS, secrets, sharp/libstdc++, `/opt/brain-dist` volume, scaffold quirks)
- [ ] Set the shared AI provider spend cap and document the ceiling
- [ ] Pick cohort 1 users
- [ ] Provision cohort 1
- [ ] After 2 weeks, review cohort 1; update playbook; decide whether to proceed to cohort 2

## Relationship to other plans

This plan is the **step before** `docs/plans/hosted-rovers.md`. The hosted-rover plan's validity depends on operational data from real users; the pilot generates that data.

This plan **depends on** `docs/plans/standalone-image-publish-contract.md` being implemented, because pilot users will hit the standalone image publish path as soon as the scaffold is the source of truth for their repo. Unresolved items in that plan become pilot blockers.

This plan **does not block** hosted-rover work from starting; it runs in parallel. But concrete architecture decisions for hosted-rover should wait on cohort 1-2 evidence.

## Related

- `docs/plans/hosted-rovers.md` — long-term destination
- `docs/plans/standalone-apps.md` — the per-user standalone deploy model this plan relies on
- `docs/plans/standalone-image-publish-contract.md` — image contract the scaffold needs to respect
