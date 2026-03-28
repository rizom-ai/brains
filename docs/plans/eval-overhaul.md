# Plan: Eval Overhaul

## Context

The eval system works but has grown organically into three separate silos:

1. **Plugin evals** (`entities/*/evals/`) — legacy `brain.eval.config.ts`, each plugin spins up a minimal brain. ~31 test cases across 7 entity plugins.
2. **App evals** (`apps/*/test-cases/`) — `brain.eval.yaml`, full brain with eval mode. 46 test cases.
3. **Shell evals** (`shell/ai-evaluation/evals/`) — 7 generic test cases, unclear integration.

Problems:

- **Plugin evals use 7 identical boilerplate configs** — `brain.eval.config.ts` files that differ only in which plugin they import
- **84% of app evals are generic** — they test tool behavior, not instance-specific content
- **No unified reporting** — each run produces isolated console output and timestamped JSON files
- **No history or trends** — no comparison between runs, no regression detection

## Design Principles

- **Same runner for both agent and plugin evals** — plugin evals just use a simpler config
- **`eval.yaml` replaces `brain.eval.config.ts`** — declarative, no boilerplate TypeScript
- **Repo-level result store** — `eval-results/` at repo root, committed to git
- **Named baselines + history** — compare against previous run or named snapshots

## Phase 1: Eval Mode ✅

Replaced `preset: eval` with `mode: eval` that layers on top of any preset. Brain models define `evalDisable` listing plugins with external side effects. Committed.

## Phase 2: Replace plugin eval configs with `eval.yaml`

The 7 `brain.eval.config.ts` files are identical boilerplate:

```typescript
import { defineConfig } from "@brains/app";
import { BlogPlugin } from "../src";
export default defineConfig({
  name: "blog-eval",
  version: "0.1.0",
  aiApiKey: process.env["ANTHROPIC_API_KEY"],
  database: `file:/tmp/blog-eval-${Date.now()}.db`,
  plugins: [new BlogPlugin({})],
});
```

Replace with declarative `eval.yaml`:

```yaml
# entities/blog/evals/eval.yaml
plugin: "@brains/blog"
```

The runner auto-generates the equivalent config: imports the plugin's default export, creates an in-memory DB, injects the API key from env, registers the single plugin in a minimal shell. Same execution path as today, zero boilerplate.

### What the loader does

1. Read `eval.yaml` from current directory
2. `plugin` field → dynamic import → get default export (plugin factory or plugin instance)
3. Create `defineConfig()` with: name from plugin ID, in-memory DB, `ANTHROPIC_API_KEY` from env, single plugin
4. Pass to existing `loadEvalConfig()` → `App.create()` → `app.initialize()` → run tests

### Optional fields

```yaml
plugin: "@brains/blog"
config: # Plugin config overrides (optional)
  autoGenerateOnPublish: false
aiModel: sonnet # Override AI model (optional, future)
```

### Steps

1. Add `eval.yaml` schema and loader to `run-evaluations.ts`
2. Create `eval.yaml` for each of the 7 entity plugins
3. Delete 7 `brain.eval.config.ts` files
4. Test: `cd entities/blog/evals && bun run eval` still works

### Files

| File                                         | Change                                                                                 |
| -------------------------------------------- | -------------------------------------------------------------------------------------- |
| `shell/ai-evaluation/src/run-evaluations.ts` | Add `eval.yaml` loader alongside existing `brain.eval.yaml` and `brain.eval.config.ts` |
| `entities/*/evals/eval.yaml`                 | New — one line each                                                                    |
| `entities/*/evals/brain.eval.config.ts`      | Delete                                                                                 |

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

**Plugin evals stay with plugins** — `entities/*/evals/test-cases/` unchanged. The runner loads them from the plugin directory.

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

### Steps

1. Update agent runner to load from multiple directories
2. Move generic test cases to `brains/rover/test-cases/`
3. Move ranger-specific test cases to `brains/ranger/test-cases/`
4. Verify app-level test cases still work as overrides
5. Tests

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
      ...
```

Both agent and plugin evals write to the same store. `latest.json` is a copy of the most recent run. Named baselines are saved via `--baseline <name>`.

### Reporters

All reporters receive the same `EvaluationSummary`.

**Console reporter** (existing, keep) — colored pass/fail during the run.

**JSON reporter** (existing, redirect) — writes to `eval-results/` instead of per-app `data/evaluation-results/`.

**Markdown reporter** (new) — generates summary for commit messages:

```markdown
## Eval Run: rover/default (2026-03-23)

**47 tests** — 45 passed, 2 failed (95.7%)

| Category         | Pass | Fail | Rate  |
| ---------------- | ---- | ---- | ----- |
| tool-invocation  | 22   | 1    | 95.5% |
| response-quality | 3    | 0    | 100%  |

### Failures

- **search-tool**: Response must contain "results"
- **blog-context**: Quality score 2.1 < min 3.0
```

**Comparison reporter** (new) — diffs current run against previous or named baseline:

```markdown
## Comparison: current vs baseline

| Metric     | Previous | Current | Delta  |
| ---------- | -------- | ------- | ------ |
| Pass rate  | 93.6%    | 95.7%   | +2.1%  |
| Avg tokens | 1,456    | 1,234   | -15.2% |

### Regressions

- **search-tool**: was passing, now failing

### Fixes

- **newsletter-generate**: was failing, now passing
```

### CLI

```bash
# Agent evals (from app directory)
bun run eval
bun run eval --compare
bun run eval --compare baseline
bun run eval --baseline pre-refactor
bun run eval --skip-llm-judge

# Plugin evals (from plugin eval directory)
cd entities/blog/evals && bun run eval
cd entities/blog/evals && bun run eval --skip-llm-judge
cd entities/blog/evals && bun run eval --compare
```

### Steps

1. Create `eval-results/` directory structure
2. Redirect JSON reporter to write to `eval-results/`
3. Add `--baseline` flag to save named snapshots
4. Markdown reporter
5. Comparison reporter + `--compare` flag

## Steps (ordered)

1. ~~Phase 1: evalDisable + mode: eval~~ ✅
2. Phase 2: Replace `brain.eval.config.ts` with `eval.yaml`
3. Phase 3a: Update agent runner to load from multiple directories
4. Phase 3b: Move generic test cases to brain model level
5. Phase 4a: Result store at repo root + redirect JSON reporter
6. Phase 4b: Markdown reporter
7. Phase 4c: Comparison reporter + baselines

## Verification

1. `bun run typecheck` / `bun test` / `bun run lint`
2. `preset: pro` + `mode: eval` produces pro plugins minus side-effect plugins
3. `bun run eval` from `apps/professional-brain/` — runs shell + rover + yeehaa agent tests
4. `bun run eval` from `apps/collective-brain/` — runs shell + ranger + collective agent tests
5. `bun run eval` from `entities/blog/evals/` — runs blog plugin tests (minimal brain, no full app)
6. Results written to `eval-results/` at repo root
7. Markdown report generated after each run
8. `--compare` shows regressions and fixes against previous run
9. `--baseline` saves named snapshot for future comparison
10. No test case references old file paths
11. No `brain.eval.config.ts` files remain
