# Plan: Public authoring API compatibility for `v0.2.0`

Last updated: 2026-09-13

## Status

**Active stable-release gate. No final alpha is nominated.**

The alpha authoring foundation, external fixtures, declaration checks, packed harnesses, exact-registry harness, and site-first stable release orchestration are implemented. The final declarative boundary/DX correction is complete on `work/plugin-api-boundaries` through `26b3b57c9a`, but it is not merged into `main`, published as a candidate, or accepted as stable evidence.

The latest published core alpha, `@rizom/brain@0.2.0-alpha.373`, predates that integration and is therefore not the final candidate. Historical evidence against Brain `alpha.313` and Site `alpha.233` proves the harness, not the current release.

This plan now owns only the remaining nomination, publication, and compatibility-freeze work. The accepted contract is documented in:

- [Authoring API `0.2`](../public-release/AUTHORING_API_0.2.md);
- [Alpha authoring migration](../public-release/AUTHORING_0.2_MIGRATION.md);
- [External plugin authoring](../external-plugin-authoring.md);
- [External site authoring](../external-site-authoring.md); and
- [Nomination evidence](../public-release/evidence/AUTHORING_0.2.md).

Completed implementation history belongs in those contract docs, package changelogs, fixtures, and Git history rather than this active plan.

## Goal

Publish stable `@rizom/brain@0.2.0` with a public authoring boundary that an outside package can use without importing private `@brains/*` workspaces, implementing runtime registries or process roles, duplicating runtime-owned entity fields, or depending on monorepo tooling.

The stable contract covers these eight fixture families:

1. custom entity package;
2. custom service package;
3. custom site package;
4. custom generic interface package;
5. custom message interface package;
6. root brain-definition package;
7. account-settings extension; and
8. Dashboard/Studio operator extension.

For the `0.2.x` line, removals, renamed required fields, narrowed author inputs, callback variance changes, and semantic breaks wait for `0.3.0` unless a security defect requires otherwise. Runtime-produced outputs may grow additively; author-constructed inputs may gain only optional fields.

## Remaining gates

### 1. Integrate the intended stable source

- Review and merge `work/plugin-api-boundaries` without reintroducing superseded alpha aliases, overloads, constructors, or dual authoring paths.
- Reconcile every branch selected for the candidate at the declarative boundary; Public Ask and Studio are already integrated on the authoring branch, while generic content generation is included only if separately approved to land before nomination.
- Require clean generated declarations, export-ledger agreement, architecture checks, and no private workspace types in published output.
- Ensure no other pre-stable breaking authoring change is queued for the candidate.

**Exit:** one clean `main` SHA contains the complete intended `0.2` contract.

### 2. Publish and nominate one final alpha

- Let the normal Core and Site release lanes publish the exact source; do not infer versions or use floating tags.
- Record the Brain alpha, compatible Site SDK, source SHA, version commits, Bun version, and registry integrity.
- Rerun all eight exact-version registry consumers against that pair.
- Preserve historical fixture peer floors unless the exercised contract changed; do not rewrite history to make a new alpha appear compatible.

**Exit:** the evidence record names one exact candidate pair and source SHA.

### 3. Run the final evidence protocol

From the nominated source, record:

- formatting, typecheck, lint, architecture, changeset, docs, and full test results;
- focused and complete packed compatibility tiers using immutable packed artifacts;
- the credentialed live harness for embedding completion, semantic ranking, agent chat, confirmation, inbound conversation, attachments, model-backed progress, and bounded shutdown;
- personal and team eval suites with the checked model/judge and zero accepted failures; and
- provider model IDs, durations, bounded retries, costs where applicable, and secret-safe diagnostics.

Mocked providers prove mechanics but do not satisfy the live gate. Earlier successful CI does not approve a newer moving source SHA.

**Exit:** [`docs/public-release/evidence/AUTHORING_0.2.md`](../public-release/evidence/AUTHORING_0.2.md) contains complete evidence for the nominated pair.

### 4. Certify deployment

- Deploy the nominated alpha to approved canaries with coherent config/image/package pins.
- Require operational health, app-managed site rebuild evidence, and zero second-pass generated drift.
- Complete the approved soak and validate `yeehaa.io` on the same candidate.
- Roll back code/config together if a gate fails.

**Exit:** deployment evidence certifies the candidate rather than an older alpha or persisted predeploy output.

### 5. Obtain authorization and publish stable

A green branch, plan, CI run, or evidence matrix is not release authorization.

After explicit approval:

1. exit Changesets prerelease mode through the tested coordinated workflow;
2. publish stable Site first;
3. rerun exact registry evidence against stable Site and the nominated Brain source;
4. publish stable Brain only after that gate passes;
5. deploy canaries before wider fleet promotion; and
6. freeze and rename the eight fixtures as the immutable `0.2.0` compatibility baseline.

## Release invariants

- Site/theme and core packages keep their independent release lanes and exact compatibility metadata.
- Stable orchestration validates the exact checked-out SHA; an older green workflow cannot approve newer source.
- Publication is site-first and fails closed if history, CI, registry metadata, or candidate identity is unavailable.
- External fixtures build against installed packages, not workspace source or hidden monorepo aliases.
- Provider-backed evidence is bounded and explicitly authorized; secrets and private content never enter artifacts.
- No compatibility shim is added solely for an unpublished alpha contract.

## Non-goals

- Stabilizing every runtime or plugin-system symbol before `1.0`.
- Publishing every built-in plugin as an independent public package for `0.2.0`.
- Treating Public Ask launch, collective field validation, Turso, or optional capabilities as release gates.
- Authorizing npm publication, dist-tag changes, deployment, or paid provider work merely by editing this plan.

## Completion

Delete this plan after stable `0.2.0` is published and its eight-fixture baseline is frozen. Ongoing compatibility policy then belongs in the public authoring contract, stability policy, release evidence, and patch-candidate checks.
