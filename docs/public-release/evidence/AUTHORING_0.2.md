# Public authoring `0.2.0` nomination evidence

## Status

**Draft — no final alpha is nominated; integration, crossover, and credentialed evidence remain pending.**

This record must not be treated as authorization to exit prerelease mode, dispatch a stable release, publish a stable package, or mutate an npm dist-tag.

## Provisional pre-nomination baseline

| Evidence field       | Value                                      |
| -------------------- | ------------------------------------------ |
| Recorded             | `2026-08-22T16:38:09Z`                     |
| Evidence source SHA  | `90abdfd2cc05dd7f1a55441fa0838d06f8ba2394` |
| Baseline Brain       | `@rizom/brain@0.2.0-alpha.317`             |
| Brain version commit | `f976fc5cbb0455369744e9834b65033d9b1f4fe0` |
| Compatible Site SDK  | `@rizom/site@0.2.0-alpha.233`              |
| Bun                  | `1.3.11`                                   |
| Node                 | `v24.10.0`                                 |

This is not the final candidate. The stable-source roadmap requires the replacement Brain Model capability taxonomy, an authorized clean fleet crossover, canary soak, and `yeehaa.io` validation before nomination. The React renderer migration is implemented on its worktree and is explicitly time-boxed for a pre-`0.2.0` integration decision because deferring its published peer change makes it a `0.3.0` break.

## Published registry state

Read-only npm queries returned:

- `@rizom/brain@0.2.0-alpha.317`: published
- `@rizom/brain` dist-tags: `latest=0.2.0-alpha.317`, `alpha=0.1.1-alpha.0`
- `@rizom/site@0.2.0-alpha.233`: published
- `@rizom/site` dist-tags: `latest=0.2.0-alpha.233`, `alpha=0.2.0-alpha.142`

Historical authoring floors remain unchanged:

- Original six fixtures: `>=0.2.0-alpha.272 <0.3.0`
- Account settings: `>=0.2.0-alpha.304 <0.3.0`
- Operator composition: `>=0.2.0-alpha.313 <0.3.0`

## Evidence completed

### Provisional non-credentialed nomination protocol

The provisional baseline source passed every non-credentialed command in the nomination protocol on 2026-08-22. These results establish harness readiness only; they must be rerun against the final integrated alpha and clean source SHA.

| Check                                | Result                                               | Duration     |
| ------------------------------------ | ---------------------------------------------------- | ------------ |
| `bun run format:check`               | Passed                                               | 26 seconds   |
| `bun run typecheck`                  | 101 tasks passed                                     | 27 seconds   |
| `bun run lint`                       | 92 tasks passed                                      | 7 seconds    |
| `bun run arch:check`                 | 3,021 modules and 13,285 dependencies, no violations | 5 seconds    |
| `bun run changeset:check`            | 0 pending changesets, valid release lanes            | 1 second     |
| `bun run docs:check`                 | Links, manifest, and roadmap passed                  | Not recorded |
| `bun run test`                       | 98 tasks passed                                      | 56 seconds   |
| Golden authoring suite               | 20 tests and 371 expectations passed                 | 2 seconds    |
| Complete packed compatibility matrix | 6 tests and 55 expectations passed                   | 59 seconds   |

The full repository test included 444 passing Brain tests and 644 passing directory-sync tests. The expected opt-in packed, live-provider, registry, soak, and deployed tests remained skipped unless separately invoked by their evidence lanes.

### Repository CI

Commit `b3fc9d4e6048c8b542f4b7af85d0284cea515671` passed:

- [Core CI run 32390015186](https://github.com/rizom-ai/brains/actions/runs/32390015186)
- [Architecture CI run 32390015139](https://github.com/rizom-ai/brains/actions/runs/32390015139)
- [Site CI run 32390015305](https://github.com/rizom-ai/brains/actions/runs/32390015305)

Its local pre-commit suite passed all 98 tasks, including 444 Brain tests and 644 directory-sync tests.

### Pre-publication packed and smoke evidence

[Core Release run 32391519439](https://github.com/rizom-ai/brains/actions/runs/32391519439) generated and published Brain `0.2.0-alpha.317`, then passed before publication:

- Complete hermetic packed compatibility matrix: 6 tests, 0 failures, 90.13 seconds
- `@rizom/ops` pre-publish smoke suite: 206 tests across 23 files, 0 failures, 14.49 seconds

### Exact eight-package registry evidence

The following command passed from current `main` against the exact published candidate pair:

```bash
RIZOM_PUBLIC_API_REGISTRY_EVIDENCE=1 \
RIZOM_PUBLIC_API_BRAIN_VERSION=0.2.0-alpha.317 \
RIZOM_PUBLIC_API_SITE_VERSION=0.2.0-alpha.233 \
bun test packages/brain-cli/test/public-authoring-registry-packed.test.ts
```

Result: 1 test passed, 27 expectations, 0 failures, 5.67 seconds.

## Release blocker discovered

[Site Release run 32390257467](https://github.com/rizom-ai/brains/actions/runs/32390257467) passed classification, compatibility verification, the six-test packed matrix, build, and publish-metadata verification. npm then rejected the first publication of four intentionally public packages with E404/access errors:

- `@rizom/theme-default@0.2.0-alpha.235`
- `@rizom/theme-rizom-ai@0.2.0-alpha.235`
- `@rizom/site-rizom@0.2.0-alpha.239`
- `@rizom/site-rizom-ai@0.2.0-alpha.239`

Read-only registry checks confirmed that none of those four versions published. The npm credential must be granted package-creation/access authority, or the packages must be created through an authorized npm operation, before retrying Site Release or attempting the stable site-first sequence.

## Pending nomination gates

- [ ] Integrate and publish the replacement Brain Model capability taxonomy.
- [ ] Complete the authorized fleet crossover, canary soak, and `yeehaa.io` validation.
- [ ] Rebase and integrate the React renderer migration before prerelease exit, or explicitly defer it as a `0.3.0` break.
- [ ] Explicitly nominate the resulting final Brain alpha and source SHA.
- [ ] Rerun the complete repository protocol from that clean source SHA.
- [ ] Run `public-authoring-live-packed.test.ts` with explicitly supplied provider credentials.
- [ ] Run personal and team evals with the checked model and judge; both must report zero failures.
- [ ] Record provider model IDs, durations, bounded retries, and secret-safe results.
- [ ] Resolve the npm access blocker for the four public Site/theme packages.
- [ ] Obtain separate explicit authorization before prerelease exit, stable workflow dispatch, npm publication, or dist-tag mutation.
- [ ] After authorized stable Site publication, rerun exact registry evidence against the stable Site SDK before stable Brain publication.
- [ ] Freeze and rename the eight-fixture `0.2.0` compatibility baseline after stable publication.
