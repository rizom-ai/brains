# Plan: Eval Overhaul

## Context

The eval system works but has grown organically into three separate silos:

1. **Plugin evals** (`plugins/*/evals/`) — legacy `brain.eval.config.ts`, each plugin spins up a minimal brain. ~31 test cases across 8 plugins.
2. **App evals** (`apps/*/test-cases/`) — `brain.eval.yaml`, full brain with eval preset. 46 test cases.
3. **Shell evals** (`shell/ai-evaluation/evals/`) — 7 generic test cases, unclear integration.

Problems:

- **Eval is a preset, but it's a safety constraint** — maintaining a separate plugin list drifts out of sync
- **84% of app evals are generic** — they test tool behavior, not instance-specific content
- **Plugin evals use legacy config** — `defineConfig()` spinning up a full brain for handler tests
- **No unified reporting** — each run produces isolated console output and timestamped JSON files
- **No history or trends** — no comparison between runs, no regression detection
- **No single place to see results** — results scattered across apps and plugins

## Design Principles

- **Two runners**: agent evals (full brain, conversation, tool routing) and handler evals (no brain, just handler + AI)
- **Shared reporting format**: both runners produce the same result schema
- **Repo-level result store**: `eval-results/` at repo root, committed to git
- **Named baselines + history**: compare against previous run or named snapshots

## Phase 1: Eval Mode (replaces eval preset)

Replace `preset: eval` with `mode: eval` that layers on top of any preset.

```yaml
# Before
preset: eval

# After
preset: default
mode: eval
```

The brain model defines which plugins are **unsafe for eval**:

```typescript
export default defineBrain({
  name: "rover",
  presets: { minimal, default: standard, pro },
  evalDisable: [
    "matrix",
    "discord",
    "analytics",
    "dashboard",
    "content-pipeline",
    "newsletter",
    "webserver",
  ],
});
```

### Resolution

```
1. Resolve preset → activeIds
2. If mode === "eval": remove all IDs in definition.evalDisable
3. Apply add/remove as usual
```

### What gets disabled in eval

Plugins with external side effects:

- Chat interfaces (matrix, discord) — sends messages to real users
- Analytics — sends data to Cloudflare
- Content pipeline — auto-publishes
- Newsletter — sends emails
- Webserver — serves public site
- Dashboard — not needed without webserver

### Steps

1. Add `evalDisable: string[]` to `BrainDefinition`
2. Add `mode: z.enum(["eval"]).optional()` to instance overrides schema
3. Update `resolveActiveIds()` in brain-resolver to apply evalDisable when mode is eval
4. Remove `eval` from rover preset definitions
5. Add `evalDisable` to ranger and relay (they currently have no eval preset)
6. Update `brain.eval.yaml` files: `preset: eval` → `preset: default` + `mode: eval`
7. Tests

### Key files

| File                                  | Change                                |
| ------------------------------------- | ------------------------------------- |
| `shell/app/src/brain-definition.ts`   | Add `evalDisable` to BrainDefinition  |
| `shell/app/src/instance-overrides.ts` | Add `mode` field                      |
| `shell/app/src/brain-resolver.ts`     | Apply evalDisable in resolveActiveIds |
| `brains/rover/src/index.ts`           | Remove eval preset, add evalDisable   |
| `brains/ranger/src/index.ts`          | Add evalDisable                       |
| `brains/relay/src/index.ts`           | Add evalDisable                       |
| `apps/*/brain.eval.yaml`              | `preset: default` + `mode: eval`      |

## Phase 2: Split into two runners

### Agent runner (existing, refined)

Full brain + conversation + tool invocation checks + LLM-as-judge for response quality. Tests agent behavior: does it pick the right tool? Does it respond helpfully?

- Runs from app directories (`apps/*/`)
- Loads test cases from three tiers (see Phase 3)
- Requires `brain.eval.yaml` with brain model
- Expensive — full conversation per test case

### Handler runner (new, lightweight)

No brain. Imports the handler directly, injects a real AI service, validates output. Tests generation quality: does blog generation produce good content? Does topic extraction find the right topics?

- Runs from plugin eval directories (`plugins/*/evals/`)
- Minimal config — no brain model, no preset, no plugin resolution:

```yaml
# plugins/blog/evals/eval.yaml
handler: ./src/handlers/generation-handler.ts
aiModel: sonnet
```

- Uses YAML test cases with the same schema (quality criteria, LLM judge)
- `--skip-llm-judge` available for fast local iteration
- Cheap — no conversation overhead, just handler input → output

### Shared between both

- YAML test case format
- `EvaluationResult` / `EvaluationSummary` schemas
- LLM-as-judge scoring
- All reporters (console, JSON, markdown, comparison)
- Result store format

## Phase 3: Consolidate test case locations

### Agent eval: three-tier loading

The agent runner loads test cases from multiple directories, merged in priority order:

```
1. Shell-level     shell/ai-evaluation/evals/test-cases/    (brain-agnostic defaults)
2. Brain model     brains/{model}/test-cases/                (generic tool/agent tests)
3. App instance    apps/{instance}/test-cases/               (instance-specific overrides by filename)
```

Higher tiers override lower tiers by test case `id`.

### What moves where

**To `brains/rover/test-cases/`** (37 files) — generic tool and agent behavior:

- All tool-invocation tests (except system-get, newsletter-generate-from-post)
- Response quality: helpful-summary, accurate-summaries
- Multi-turn: list-then-detail, generate-cover-for-existing-post
- Plugin: social-media-create, social-media-create-from-content
- Root-level agent tests (generate-\*, social-media-\*-agent)

**Stays in `apps/professional-brain/test-cases/`** (7 files) — yeehaa-specific:

- system-get.yaml (references "The Low End Theory")
- newsletter-generate-from-post.yaml (references "Urging New Institutions")
- blog-context-aware.yaml, blog-rizom-context.yaml, decks-context-aware.yaml
- data-in-response.yaml, newsletter-generate-agent.yaml

**To `brains/ranger/test-cases/`** (2 files):

- wishlist-add-variations.yaml, wishlist-add-unfulfillable.yaml

**Shell evals stay** (7 files) — brain-agnostic response quality baselines.

### Handler evals stay with plugins

Plugin-level test cases (`plugins/*/evals/test-cases/`) stay where they are. The handler runner loads them directly. No migration needed — only the runner config changes (legacy `brain.eval.config.ts` → lightweight `eval.yaml`).

### Runner changes

Agent runner resolves the brain package path from `brain.eval.yaml`'s `brain:` field, then merges test cases from all three tiers:

```typescript
testCasesDirectory: [
  shellEvalTestCases, // shell/ai-evaluation/evals/test-cases/
  brainModelTestCases, // brains/rover/test-cases/
  resolvePath(cwd, "test-cases"), // apps/professional-brain/test-cases/
];
```

`EvaluationService` already accepts `string | string[]` for `testCasesDirectory`.

## Phase 4: Unified reporting and result store

### Result store

Single directory at repo root, committed to git:

```
eval-results/
  agent/
    rover/
      latest.json
      baseline.json
      2026-03-23T14-30.json
    ranger/
      latest.json
      ...
  handler/
    blog/
      latest.json
      baseline.json
      2026-03-23T14-30.json
    link/
      ...
```

Both runners write to the same store. `latest.json` is a copy of (not symlink to) the most recent run. Named baselines are saved via `--baseline <name>`.

### Reporters

All reporters receive the same `EvaluationSummary` — shared between agent and handler runners.

**Console reporter** (existing, keep) — colored pass/fail during the run.

**JSON reporter** (existing, redirect) — writes to `eval-results/{type}/{name}/` instead of per-app `data/evaluation-results/`.

**Markdown reporter** (new) — generates summary for commit messages and quick review:

```markdown
## Eval Run: rover/default (2026-03-23)

**47 tests** — 45 passed, 2 failed (95.7%)

| Category         | Pass | Fail | Rate  |
| ---------------- | ---- | ---- | ----- |
| tool-invocation  | 22   | 1    | 95.5% |
| response-quality | 3    | 0    | 100%  |
| plugin           | 6    | 1    | 85.7% |
| multi-turn       | 2    | 0    | 100%  |
| agent            | 12   | 0    | 100%  |

### Failures

- **search-tool**: Response must contain "results"
- **blog-context**: Quality score 2.1 < min 3.0

### Metrics (avg)

Tokens: 1,234 | Tool calls: 2.3 | Duration: 1.2s

### Quality (avg)

Helpfulness: 4.5 | Accuracy: 4.2 | Instructions: 4.8
```

Passing tests are not listed individually — only failures.

**Comparison reporter** (new) — diffs current run against previous run or named baseline. Reports only, does not fail the run on regressions.

```markdown
## Comparison: 2026-03-23 vs baseline

| Metric       | Previous | Current | Delta  |
| ------------ | -------- | ------- | ------ |
| Pass rate    | 93.6%    | 95.7%   | +2.1%  |
| Avg tokens   | 1,456    | 1,234   | -15.2% |
| Avg duration | 1.8s     | 1.2s    | -33.3% |
| Helpfulness  | 4.3      | 4.5     | +0.2   |

### Regressions

- **search-tool**: was passing, now failing

### Fixes

- **newsletter-generate**: was failing, now passing
```

### CLI

```bash
# Agent evals
cd apps/professional-brain && bun run eval
cd apps/professional-brain && bun run eval --compare              # compare with last run
cd apps/professional-brain && bun run eval --compare baseline     # compare with named baseline
cd apps/professional-brain && bun run eval --baseline pre-refactor # save as named baseline
cd apps/professional-brain && bun run eval --skip-llm-judge       # fast mode

# Handler evals
cd plugins/blog/evals && bun run eval
cd plugins/blog/evals && bun run eval --skip-llm-judge            # fast mode
cd plugins/blog/evals && bun run eval --compare                   # compare with last run
```

## Steps (ordered)

1. Phase 1: evalDisable + mode: eval
2. Phase 2: Handler runner (new, lightweight)
3. Phase 3a: Update agent runner to load from multiple directories
4. Phase 3b: Move generic test cases to brain model level
5. Phase 3c: Migrate plugin eval configs to `eval.yaml`
6. Phase 4a: Result store at repo root + redirect JSON reporter
7. Phase 4b: Markdown reporter
8. Phase 4c: Comparison reporter + baselines

## Verification

1. `bun run typecheck` / `bun test` / `bun run lint`
2. `preset: pro` + `mode: eval` produces pro plugins minus chat/analytics/etc.
3. `preset: minimal` + `mode: eval` produces minimal minus discord
4. `bun run eval` from `apps/professional-brain/` — runs shell + rover + yeehaa agent tests
5. `bun run eval` from `apps/collective-brain/` — runs shell + ranger + collective agent tests
6. `bun run eval` from `plugins/blog/evals/` — runs blog handler tests (no brain)
7. Results written to `eval-results/` at repo root
8. Markdown report generated after each run
9. `--compare` shows regressions and fixes against previous run
10. `--baseline` saves named snapshot for future comparison
11. No test case references old file paths
