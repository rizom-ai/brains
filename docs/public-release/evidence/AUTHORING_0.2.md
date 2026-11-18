# Public authoring `0.2.0` nomination evidence

Last updated: 2026-11-18

## Status

**Nominated candidate: `@rizom/brain@0.2.0-alpha.744` with `@rizom/site@0.2.0-alpha.246`, from source `82b8adfcac90f1488c1bca763a80be9ae706418d`.** Gates 1–4 pass. The one open item is the smoke canary's app-managed site rebuild, which waits on a Smoke Rover sign-in.

This record is evidence, not authorization to exit prerelease mode, dispatch a stable workflow, publish stable packages, change npm dist-tags, or roll out a stable release.

## Candidate

| Field                    | Value                                                                                                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brain                    | `@rizom/brain@0.2.0-alpha.744`, `sha512-yDUlh+mecPt8YrVAbr8MUbcjj5ylE78vHBh26+rjaxs5YjGpvyFobAOww7sekQTQmW59LHNnA8RnGgZtTAA3ag==`                                                      |
| Ops                      | `@rizom/ops@0.2.0-alpha.744`, `sha512-Sjp4uJgm/QTuEMaQp6ZEyHafLnIDB8bpV8Y1fcolpbCkXePlG3uITMdS9/P+bMe8uyxOkTY8i8KA3DSC2VteZQ==`                                                        |
| Brain UI                 | `@rizom/brain-ui@0.2.0-alpha.744`, `sha512-Qv03Gux+rU64Ly9SkPcfZyTo+5+VZsX/Ost6WxzlMrS6WUPwj3OBk+bHtb4yyFfjPxVzn3+fGioLUxIrfZtSxw==`                                                   |
| Site SDK                 | `@rizom/site@0.2.0-alpha.246` (`latest`), `sha512-Zsqc97+dlkcWDVgSnWaKqo5jDoFlO8yp7MfsUjHkOG2eNZ7oZ990ZcTywRz1FSL0LCkeyjC+8fOl/mg2hQhN0g==`                                            |
| Brain source SHA         | `82b8adfcac90f1488c1bca763a80be9ae706418d` (the registry `gitHead` of all three core packages; `main` at nomination)                                                                   |
| Brain version commit     | `82b8adfcac` (`chore(release): version packages`), over merge `4f4b729bab`                                                                                                             |
| Site SDK source          | `gitHead` `168a7c21fe6b9bcc08fca90e4ea101d519315e26`; `packages/site` is unchanged from it to the Brain source SHA                                                                     |
| Bun                      | `1.4.0`                                                                                                                                                                                |
| Core Release             | [44298937932](https://github.com/rizom-ai/brains/actions/runs/44298937932)                                                                                                             |
| Site Release             | [43570926364](https://github.com/rizom-ai/brains/actions/runs/43570926364)                                                                                                             |
| Core and Architecture CI | [44297636356](https://github.com/rizom-ai/brains/actions/runs/44297636356), [44297636202](https://github.com/rizom-ai/brains/actions/runs/44297636202) on `4f4b729bab`                 |
| Packed Compatibility     | [44297642582](https://github.com/rizom-ai/brains/actions/runs/44297642582) on `4f4b729bab`; [44301909455](https://github.com/rizom-ai/brains/actions/runs/44301909455) on `82b8adfcac` |

Versions and integrity were read from the npm registry by exact version; no floating tag was used.

## Gate 1: intended stable source

- Durable binary asset storage landed on `main` through removal of the data-URL bridge (#992). The [migration guide](../AUTHORING_0.2_MIGRATION.md) states that a binary record's bytes are no longer its `content`, that no read hands back a data URL, and that bytes are read with `readBytes`.
- No further pre-stable breaking authoring-contract change is queued.

## Gate 2: exact registry pair

`public-authoring-registry-packed.test.ts` with `RIZOM_PUBLIC_API_REGISTRY_EVIDENCE=1`, Brain `0.2.0-alpha.744` and Site `0.2.0-alpha.246` passed: 1 test, 30 assertions. It packed all eight fixture families against the installed registry packages, verified their versions, licenses, declarations and export maps, held each fixture's original peer floor, and started the consumer standalone.

## Gate 3: evidence protocol

All runs were made at the Brain source SHA in a clean detached worktree, which stayed clean.

| Check                                               | Result                                                   |
| --------------------------------------------------- | -------------------------------------------------------- |
| `format:check`                                      | Pass                                                     |
| `typecheck` (turbo, forced)                         | 131 of 131 tasks, 0 cached                               |
| `typecheck:scripts`                                 | Pass                                                     |
| `lint` (`scripts/lint.mjs --force`)                 | 120 of 120 tasks, 0 cached                               |
| `arch:check`, `changeset:check`                     | Pass                                                     |
| `docs:check`                                        | Pass                                                     |
| `legacy:check`, `tests:assertions`, `catches:check` | Pass                                                     |
| `test` (turbo, forced)                              | 130 of 130 tasks, 0 cached                               |
| `test:scripts`                                      | 297 pass                                                 |
| `@rizom/brain` `bun run test`                       | 881 pass, 15 evidence-gated skips, 0 fail                |
| `@rizom/brain` `test:evals`                         | 16 pass                                                  |
| Focused tier: `surface:check`                       | 58 + 6 pass, including boot smoke and the served surface |
| Complete tier: `test:packed:compat`                 | 10 pass, 0 fail, from one immutable packed Brain         |

The 15 skips are the tests that run only under their own evidence flag: the nine packed files the complete tier runs, the registry and live harnesses run above and below, the packaged Git broker recovery, the Git soak, and two canonical-bundle checks.

### Credentialed live harness

`public-authoring-live-packed.test.ts` with `RIZOM_PUBLIC_API_LIVE_EVIDENCE=1` against the exact registry pair passed: 2 tests in 21 seconds on `gpt-5.6-luna`. It proved embedding completion, semantic ranking, agent chat, confirmation, inbound conversation, attachments, model-backed progress on the editable transport message, and shutdown within 10 seconds. Its transports were local; the provider key appeared in no output. The harness records no token usage.

### Evals

Model `gpt-6-luna`, judge `gpt-5.4-mini`, one sample per case. Each case runs once; provider calls keep the AI SDK's bound of two retries, and the runs logged no rate-limit response or retry.

| Suite    | Result        | Duration | Agent tokens (prompt / completion) | Agent cost, upper bound |
| -------- | ------------- | -------- | ---------------------------------- | ----------------------- |
| personal | 31 of 31 pass | 313 s    | 886,513 / 3,362                    | $0.091                  |
| team     | 49 of 49 pass | 547 s    | 1,373,080 / 7,144                  | $0.141                  |

The upper bound prices every prompt token as uncached at the published `gpt-6-luna` rates of $0.10 input and $0.50 output per million tokens. Judge tokens are not recorded.

### Defects fixed for this candidate

Gate 3 failed on alphas 738, 739 and 742; each failure was diagnosed and fixed before this candidate:

- #996: `system_create` and `system_update` offered the fields of types their action policy never writes; the note-create and passkey budgets moved to the typed field lists.
- #998: `directory_sync` no longer draws chat uploads into a sync, and approving a contact named by its domain is one update.
- #1000: a field update to a type read as written, such as approving an agent, now reaches storage instead of reporting success and storing nothing.
- #1002: a typed search that finds the record but not the asked-for detail answers instead of searching again.

## Gate 4: deployment

All 17 rover-pilot brains and `yeehaa.io` run alpha 744; every deploy succeeded on its first attempt.

| Rollout                             | Build                                                                                                                                                                 | Reconcile                                                                       | Deploy                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| rover-pilot #328, canaries and ops  | [44301414645](https://github.com/rizom-ai/rover-pilot/actions/runs/44301414645)                                                                                       | [44301414694](https://github.com/rizom-ai/rover-pilot/actions/runs/44301414694) | [44301468467](https://github.com/rizom-ai/rover-pilot/actions/runs/44301468467) |
| rover-pilot #329, remaining cohorts | [44303223988](https://github.com/rizom-ai/rover-pilot/actions/runs/44303223988)                                                                                       | [44303223864](https://github.com/rizom-ai/rover-pilot/actions/runs/44303223864) | [44303263706](https://github.com/rizom-ai/rover-pilot/actions/runs/44303263706) |
| yeehaa-io #104                      | CI [44303236613](https://github.com/rizom-ai/yeehaa-io/actions/runs/44303236613), image [44303237453](https://github.com/rizom-ai/yeehaa-io/actions/runs/44303237453) | —                                                                               | [44303477605](https://github.com/rizom-ai/yeehaa-io/actions/runs/44303477605)   |

Every brain returned `/health/ready` 200 with all checks healthy. Predeploy backups verified every referenced asset: smoke 15 of 15, jo 1 of 1, thefourth 5 of 5, `yeehaa.io` 185 of 185 (171 images, 14 PDFs), the others none referenced; no asset failed.

- **Convergence:** `reconcile-all --dry-run` showed zero second-pass drift for both cohorts in the rollout, and again on rover-pilot `main` (`d04d21e`) with ops 744: no first-pass change and no second-pass drift. `brains-ops init` on ops 744 changed only `package.json` and `bun.lock`.
- **Locks:** each runtime lock differs from its 743 counterpart only in `@rizom/brain`.
- **`yeehaa.io`:** `system_status` reports 744, operational, with no legacy binary content, on migrated asset storage. App-managed preview and production rebuilds ran as jobs `Lwe4kBbCpVja` and `8-tGJ1WEz2Pe`; completed site builds went from 1036 to 1038 and failed stayed at 13. Afterwards all 147 sitemap pages and all 123 images returned 200, six baseline pages were unchanged, and the preview returned 200.
- **Pending:** the app-managed site rebuild on the smoke canary, which needs a Smoke Rover sign-in.

No timed soak was approved for this candidate.

## Remaining gates

- [ ] App-managed site rebuild on the smoke canary.
- [ ] Explicit authorization for prerelease exit, stable Site publication, exact stable-site registry verification, stable Brain publication, dist-tag changes, and fleet rollout.
- [ ] After stable publication, freeze and rename all eight fixtures as the immutable `0.2.0` compatibility baseline.

## Final evidence table

| Evidence                            | Result / link                                                        |
| ----------------------------------- | -------------------------------------------------------------------- |
| Candidate Brain / Site versions     | `0.2.0-alpha.744` / `0.2.0-alpha.246`                                |
| Source and version SHAs             | `82b8adfcac`; Site `168a7c21fe`                                      |
| Core, Site, and Architecture CI     | Core 44297636356, Architecture 44297636202, Site Release 43570926364 |
| Full repository protocol            | Pass                                                                 |
| Packed canary and complete matrix   | 58 + 6 pass; 10 pass                                                 |
| Exact eight-package registry matrix | Pass, 30 assertions                                                  |
| Credentialed live authoring harness | Pass, `gpt-5.6-luna`, 21 s                                           |
| Personal eval                       | 31 of 31, `gpt-6-luna` / `gpt-5.4-mini`                              |
| Team eval                           | 49 of 49, `gpt-6-luna` / `gpt-5.4-mini`                              |
| Canary convergence and soak         | Zero second-pass drift; no soak approved; smoke rebuild pending      |
| `yeehaa.io` validation              | Pass on 744                                                          |
| Release authorization               | Pending                                                              |
| Stable Site publication             | Pending                                                              |
| Stable Brain publication            | Pending                                                              |
| Frozen `0.2.0` baseline             | Pending                                                              |
