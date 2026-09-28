# Public authoring `0.2.0` nomination evidence

Last updated: 2026-09-13

## Status

**Draft — no final alpha is nominated.**

This record is evidence, not authorization to exit prerelease mode, dispatch a stable workflow, publish stable packages, change npm dist-tags, deploy a candidate, or spend provider budget.

## Ask assets/mobile sheet integration evidence scope

The approved `a16b8887f1` snapshot adds versioned Ask loader/boot routes through
existing declarative route bindings, with live authorization before serving
assets or calculating their per-instance build version. Mobile sheet host
attributes remain presentation contracts, not availability-storage keys or
caller authority. MCP HTTP starts SSE for silent requests; Studio account and
navigation refactoring retains existing authenticated APIs.

Rizom uses the public Brain UI renderer instead of the retired private UI
package. Its shared implementation is bundled and the exported helper keeps a
React-only declaration, so Site consumers do not acquire a Core package type
dependency. No declaration scanner exception or new SDK capability is needed.
Exact source/packed evidence is recorded on PR #301 after validation; mobile
component tests are not canonical browser, live-provider or deployment evidence.

## Normal-agent/runtime-role integration evidence scope

The approved `3a87eb534c` snapshot is integrated without restoring retired plugin
classes, the webserver package, raw author contexts or the private UI package.
Runtime role profiles retain web/worker separation and the SDK's register-only
backfill behavior. Expired job leases become reclaimable without requiring the
owner session heartbeat to expire; attempt/session write fences remain.
Studio hierarchy/save/draft changes and Admin setup forms use the existing
bounded SDK contracts. Opaque frontmatter opt-out, document-owned groupings,
caller-bound literal reads, storage CAS and attribution remain intact.

Guest execution now uses the ordinary configured agent and index readiness.
The former guest-specific token/context/tool/retrieval bounds and dedicated
model/accounting profile are removed. The configured answer cap is fallback
accounting, not a maximum provider charge; previous bounded-overshoot evidence
is superseded. Identity/profile/instructions enter the guest prompt (owner email
is omitted), admitted question recording no longer requires a displayed notice,
and retrieval uses ordinary query diagnostics. Local tests are not provider
billing, production privacy/disclosure, browser or deployment acceptance.

Completed as `fd2e1dbdcad48c023360121b472559b3c0f755f2`, tree
`3624f9eed10d8fc934701e7f45f4d4668996915c`, with parents `a102edd08d` and
`3a87eb534c`. Forced 107 type/build, 105 test and 98 lint tasks, seven surface
tasks, eight packed scenarios/101 assertions, full static checks and frozen
install passed. No current-head hosted acceptance was observed. No publication,
nomination or production activation was authorized.

## Document-grouping integration evidence scope

The `01f08fcada` integration replaces static/vocabulary authoring with an owned
singleton source and runtime refresh/reprojection, adds caller-bound usage and
literal-source reads, and gives opaque codecs an explicit frontmatter opt-out.
Native tests cover shutdown fencing, source revision checks, same-brain caller
identity, visibility, unexpanded edit reads and asset exclusion. Application
fixtures use real declarative packages, authenticated routes and independent
processes rather than retired plugin classes or raw source registration helpers.

Completed as `a102edd08deb3a70b2bcd925b0dc5c33f68f2feb`, tree
`9d71bff314e8f314766b59b22679b8a63dfc13d6`, with parents `654f212943` and
`01f08fcada`. Forced checks passed: 107 type/build, 105 test and 98 lint tasks;
seven surface tasks; eight isolated packed scenarios/101 assertions; the full
static suite, 150 changesets and frozen install. Normal hooks and remote SHA
were verified. These are local source/tarball guarantees, not nomination or
current hosted acceptance, and cannot attest to subsequent integrations.

## Published state recorded on 2026-09-13

This historical registry record was not refreshed during the local integration below.

| Field                  | Value                                                                      |
| ---------------------- | -------------------------------------------------------------------------- |
| Latest published Brain | `@rizom/brain@0.2.0-alpha.373`                                             |
| Brain source SHA       | `5002cb78c4f23c171f660929381ce20fdbc44942`                                 |
| Brain version commit   | `2c5ec91917d454a24fc45509f9f3571c78a0e019`                                 |
| Current Site SDK       | `@rizom/site@0.2.0-alpha.235`                                              |
| Current Rizom site     | `@rizom/site-rizom-ai@0.2.0-alpha.251`                                     |
| Bun                    | `1.4.0`                                                                    |
| Release run            | [34767467108](https://github.com/rizom-ai/brains/actions/runs/34767467108) |

The release run completed its packed compatibility matrix, pre-publish smoke tests, core builds, and npm publication. Registry inspection confirms Brain `alpha.373` and the Site/theme packages above exist.

**This is not the final candidate.** The intended declarative authoring-boundary work remains on `work/plugin-api-boundaries`; therefore `alpha.373` cannot certify the source planned for stable `0.2.0`.

## Completed foundations

The following former blockers are closed and should not be carried as pending gates:

- the canonical one-brain capability taxonomy is active; Rover/Relay/Ranger packages and runtime presets are retired;
- the ops view-ownership/convergence defect is fixed and released;
- React 19 is the sole static/client JSX contract and Preact is retired;
- core and site/theme packages publish through independent release lanes with standard compatibility metadata;
- the public Site/theme npm access blocker is resolved;
- exact hosted site and external-theme pins are required by ops;
- multi-user auth/runtime identity, Admin/Anchor separation, invitations, and signed A2A identity are shipped;
- all nine authoring fixture families, generated-declaration checks, packed harnesses, exact-registry harness, live harness, and site-first stable orchestration exist; and
- stable release workflows validate the exact source SHA and fail closed on missing CI, history, registry evidence, or a moving candidate.

Historical successful runs against Brain `alpha.313`/`alpha.317` and Site `alpha.233` established that the evidence machinery worked at those revisions. They do not certify a later candidate and are available in Git history.

## Local source integration onto `44cef035fd`

The merge-preserving integration on `work/plugin-api-boundaries` retains seven
merges, declarative SDK boundaries, and the recovery branch. Main's generation,
hierarchy, Studio titles, and operator-authorized preview guest behavior are
ported without restoring retired plugin classes or private author imports.

Local checks passed:

- 105 typecheck/build, 103 test, and 96 lint tasks, all forced;
- seven isolated packed scenarios with 79 assertions, including durable mixed
  generation after process exit and app-managed site rebuilding;
- seven surface tasks, including two built-binary boot checks;
- 104 script tests with 230 assertions;
- architecture (zero errors; the two existing Studio-documentation orphans),
  script types, docs, workspace/dependency policy, casts, legacy inventory,
  assertions, catches, changeset lanes, formatting, and frozen-lockfile install.

Focused regressions cover generation ownership, canonical metadata, preview
reachability without authorization bypass, Note title projection without source
mutation, and page markers across independently bundled SDK copies. The source
fixture now owns its generated entities; importing a foreign definition never
confers write authority.

These are local source/tarball results, not exact-registry acceptance. Registry,
provider/billing, canonical browser, eval, release, and deployment gates remain
separate. This integration does not authorize pushing rewritten history.

## Pending nomination gates

- [ ] Review and merge the intended stable source, including `work/plugin-api-boundaries` and its current integrations.
- [ ] Confirm that no further pre-stable breaking authoring-contract change is queued.
- [ ] Publish one exact final Brain alpha and record its compatible Site SDK, source SHA, version commits, registry integrity, and CI runs.
- [ ] Rerun all nine exact-version registry consumers against that pair.
- [ ] Run the complete repository protocol: format, typecheck, lint, architecture, changesets, docs, tests, package surfaces, packed canary, and full packed matrix.
- [ ] Run `public-authoring-live-packed.test.ts` with explicitly authorized provider credentials and record secret-safe embedding, semantic-ranking, chat, confirmation, inbound-conversation, attachment, progress, and shutdown evidence.
- [ ] Run personal and team evals with the checked model and judge; record model IDs, durations, retries, costs where applicable, and zero accepted failures.
- [ ] Deploy the same candidate to approved canaries, require clean second-pass convergence and app-managed site output, complete the approved soak, and validate `yeehaa.io`.
- [ ] Explicitly nominate the final alpha and source SHA.
- [ ] Obtain separate explicit authorization before prerelease exit, stable Site publication, exact stable-site registry verification, stable Brain publication, dist-tag mutation, or fleet rollout.
- [ ] After stable publication, freeze and rename all nine fixtures as the immutable `0.2.0` compatibility baseline.

## Final evidence table

Complete this only for the nominated candidate.

| Evidence                            | Result / link |
| ----------------------------------- | ------------- |
| Candidate Brain / Site versions     | Pending       |
| Source and version SHAs             | Pending       |
| Core, Site, and Architecture CI     | Pending       |
| Full repository protocol            | Pending       |
| Packed canary and complete matrix   | Pending       |
| Exact nine-package registry matrix  | Pending       |
| Credentialed live authoring harness | Pending       |
| Personal eval                       | Pending       |
| Team eval                           | Pending       |
| Canary convergence and soak         | Pending       |
| `yeehaa.io` validation              | Pending       |
| Release authorization               | Pending       |
| Stable Site publication             | Pending       |
| Stable Brain publication            | Pending       |
| Frozen `0.2.0` baseline             | Pending       |
