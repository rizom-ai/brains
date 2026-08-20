# Plan: Packed compatibility test tiering

## Status

**In progress — 2026-08-12.** The four test tiers, focused projection
regression, packed-artifact reuse, dynamic transport ports, nightly workflow,
and release gate are implemented on `work/packed-test-tiering`. The remaining
work is to freeze and rename the stable compatibility baseline during final
`0.2.0` nomination.

This stability change should land before the Turso branch's final rebase so
that migration validation uses the intended tiers. The Turso branch must rerun
`shell/core/test/projection-runtime-shell.test.ts` under both database engines;
tiering must not hide an integration regression.

Condition-based waiting, process cleanup, and temporary-resource cleanup shipped
with the test-suite-hardening work and are no longer open questions: tests wait
on `waitUntil` rather than sleeps, the packed harness reaps its own temp roots,
and an ESLint rule fails a reintroduced sleep. This plan owns **which tier runs
when**, immutable artifact reuse, and the post-`0.2.0` compatibility lifecycle.

## Goal

Keep package-boundary compatibility evidence without making every commit and
pre-commit hook rebuild, pack, install, boot, restart, and tear down the full
public-authoring matrix.

| Tier                 | Trigger                                | Evidence                                                                                             |
| -------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Focused              | Every PR and pre-commit                | Unit, type, contract, and targeted process/database integration behavior                             |
| Packed canary        | Every PR and pre-commit                | One real `@rizom/brain` tarball installs and completes canonical startup outside the monorepo        |
| Packed compatibility | Nightly, manual, and release candidate | Every external authoring fixture compiles, packs, installs, boots, and exercises its stable behavior |
| Registry/live        | Explicit release evidence only         | Exact published versions plus separately authorized provider-backed behavior                         |

## Settled architecture

### Normal feedback keeps one packed canary

`canonical-packed-consumer.test.ts` remains in ordinary `bun test`. It proves
the distribution failure class that source tests cannot:

- required files, exports, and declarations survive packing;
- the CLI starts outside the monorepo;
- startup acquires and releases runtime resources; and
- the web/worker local-open fence remains enforced.

Do not grow this into another semantic matrix. Focused tests own behavioral
regressions. In particular, the shell projection lifecycle test now covers a
source created or mutated while no worker runs, worker restart, target update,
and target deletion after another restart.

Database-engine parity remains targeted. The full public-authoring matrix runs
once against the default engine rather than multiplying every external
scenario across all engines.

### The complete local matrix is explicit

The five local packed suites use:

```text
RIZOM_PUBLIC_API_PACKED_EVIDENCE=1
```

They remain distinct from:

```text
RIZOM_PUBLIC_API_REGISTRY_EVIDENCE=1
RIZOM_PUBLIC_API_LIVE_EVIDENCE=1
```

Humans and CI use one authoritative command instead of setting the flag:

```bash
bun run test:packed:compat
```

Normal CI runs `bun run test`, which discovers and deliberately skips the five
compatibility tests while retaining the canonical packed canary. The complete
matrix runs nightly, through `workflow_dispatch`, and in the release workflow
before publication. Registry and live evidence retain separate exact-version,
credential, and authorization gates.

Correctness does not depend only on changed-path filters. Internal runtime
changes can break external packages without touching public declarations, so
the nightly run prevents rot and the release run is authoritative.

### Pack once, isolate mutable state

The compatibility runner builds and packs Brain once, then passes that
immutable tarball to every scenario. Direct execution of one opted-in packed
test falls back to packing locally for diagnosis.

Only immutable artifacts and package-manager caches may be shared. Each
scenario owns its fixture build, consumer install, databases, content paths,
dynamically assigned ports, processes, diagnostics, and cleanup.

The runner owns one temporary root, forwards termination signals to its active
child, points spawned package-manager processes into that root, and removes it
in `finally`. Harness tests verify artifact reuse and spawn-root cleanup; a
manual interrupted fixture run also left no compatibility root behind.

## Remaining work — freeze the stable baseline

Complete this during final `0.2.0` nomination:

1. Freeze the eight approved fixture packages and expectations as an immutable
   `0.2.0` compatibility baseline: the five core extensions, brain-definition
   canary, account settings, and operator surface.
2. Record their stable peer ranges and run them against the final candidate
   artifacts and exact published versions.
3. Rename the phase-oriented scenarios by contract:
   - composition and package loading;
   - entities and projections;
   - services and durable jobs;
   - sites and generated output; and
   - interfaces and message transports.
4. Make every later `0.2.x` candidate compile and run the frozen baseline.
5. Allow current golden examples to evolve additively without replacing that
   frozen proof.
6. Remove this plan after the frozen lifecycle is encoded in scripts,
   workflows, and the public-authoring compatibility documentation.

Exit:

- the `0.2.0` contract cannot drift with current examples;
- every patch candidate proves backward compatibility;
- no phase-numbered suite remains as permanent architecture; and
- ordinary PRs retain focused coverage plus one package-boundary canary.

## Validation

### Default tier

```bash
bun run test
```

Must run focused coverage and the canonical packed canary while cheaply
skipping the five complete compatibility scenarios.

### Local compatibility tier

```bash
bun run test:packed:compat
```

Must run all five local-artifact scenarios, pack Brain exactly once, and run no
registry or live scenario.

### Repository checks

```bash
bun run typecheck
bun run lint
bun run format:check
bun run docs:check
```

Use root commands so Turbo and repository policy remain authoritative.

### Release evidence

Use the exact commands and authorization gates in
[`public-authoring-api-0.2.md`](./public-authoring-api-0.2.md). Local packed
success does not substitute for exact-version registry or provider-backed
evidence.

## Acceptance criteria

1. Default PR/pre-commit tests execute one packed install/startup canary, not
   the five-suite matrix.
2. Behavioral assertions removed from the default packed tier have focused
   ownership or remain in explicit compatibility evidence; none is deleted for
   speed.
3. Stopped-worker projection create/update/delete convergence has focused
   restart coverage.
4. `bun run test:packed:compat` is used by humans, nightly CI, and release CI.
5. One compatibility invocation packs Brain once and shares only immutable
   artifacts.
6. Scenarios retain isolated mutable state and dynamically allocated ports.
7. Interrupted runs leave no child process, install staging directory, or test
   database behind.
8. Nightly CI detects rot and release CI blocks publication on failure.
9. Registry and live evidence remain explicit, exact-version, and separately
   authorized.
10. Stable `0.2.0` fixtures become immutable and run against every later
    `0.2.x` candidate.
11. Phase-oriented suite naming is retired after the stable baseline freezes.
12. Documentation no longer claims both permanent per-PR execution and a
    candidate-only post-stable lifecycle.
