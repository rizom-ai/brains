# Plan: Parallel Multi-Model Eval

## Context

Multi-model evals (`brain.eval.yaml` with `models:` list) run sequentially — one model at a time. With 2 models and ~60 test cases each, a full run takes ~5 minutes. Each model run boots a full Shell, runs all test cases, shuts down, resets singletons, then the next model starts.

Adding more models (e.g. `gemini-2.0-flash`, `gpt-4o`) makes it linearly slower. The models don't share state — each gets its own temp DB, eval content copy, and git repo. They're embarrassingly parallel.

## Approach: Subprocesses

Each model eval runs in a separate `bun` subprocess. Full OS-level isolation — own singletons, own ports, own HTTP clients. No serialization boundary, no shared state, no new abstractions.

Workers were considered and rejected:

- `AppConfig` contains class instances that can't cross `postMessage`
- Shell, EntityRegistry, etc. are process-global singletons
- Each model needs its own port allocation for webserver/MCP

```
Main process                         Subprocesses
─────────────                        ────────────
parse brain.eval.yaml               ┌─────────────────┐
prepare env per model                │ bun eval-worker  │
spawn subprocesses ─────────────────▶│   model=gpt-4o   │
                                     │   AI_API_KEY=... │
                                     │   DB=/tmp/eval-a │
                                     └────────┬────────┘
                                              │
                                     ┌────────┴────────┐
                                     │ bun eval-worker  │
                                     │   model=claude   │
                                     │   AI_API_KEY=... │
                                     │   DB=/tmp/eval-b │
                                     └────────┬────────┘
                                              │
collect JSON results from stdout ◀────────────┘
write comparison report
```

Each subprocess writes its `EvaluationSummary` as JSON to stdout. Main process collects, writes comparison report. No IPC, no message passing, no structured clone.

## Implementation

### Subprocess entry point

New file: `shell/ai-evaluation/src/eval-subprocess.ts`

Receives config via environment variables and CLI args:

- `EVAL_MODEL` — model string (e.g. `"gpt-4o-mini"`)
- `AI_API_KEY` — resolved provider key for this model
- `EVAL_DB_BASE` — pre-prepared temp DB path prefix
- `EVAL_BRAIN_YAML` — path to the brain.eval.yaml file
- `EVAL_JUDGE_MODEL` — model string for the LLM judge
- CLI args: `--test-cases-dir`, `--skip-llm-judge`, `--tags`, etc.

The subprocess resolves the brain model from `EVAL_BRAIN_YAML` (reads yaml, imports brain package, calls `resolveConfig`), overrides the AI model, boots the App, runs the test suite, and writes the `EvaluationSummary` as JSON to stdout. Stderr for logs.

### Main thread changes

In `run-evaluations.ts`, the multi-model block spawns subprocesses:

```ts
const results = await Promise.all(
  models.map((model) => {
    const evalDbBase = prepareEvalEnvironment(model);
    const providerKey = resolveProviderKey(model, process.env);

    return new Promise<ModelResult>((resolve, reject) => {
      const proc = spawn("bun", ["eval-subprocess.ts"], {
        env: {
          ...process.env,
          AI_API_KEY: providerKey,
          EVAL_MODEL: model,
          EVAL_DB_BASE: evalDbBase,
          EVAL_BRAIN_YAML: resolvePath(process.cwd(), "brain.eval.yaml"),
          EVAL_JUDGE_MODEL: judge ?? "claude-haiku-4-5",
        },
        stdio: ["ignore", "pipe", "inherit"], // stdout=JSON, stderr=logs
      });

      let json = "";
      proc.stdout.on("data", (d) => (json += d));
      proc.on("close", (code) => {
        if (code === 0) resolve({ model, summary: JSON.parse(json) });
        else reject(new Error(`${model} eval failed (exit ${code})`));
      });
    });
  }),
);
```

### Environment preparation

`prepareEvalEnvironment` already creates per-model temp dirs with unique suffixes. Each subprocess gets its own git remote path:

```diff
- const gitRemotePath = "/tmp/brain-eval-git-remote";
+ const gitRemotePath = `/tmp/brain-eval-git-remote-${suffix}`;
```

### Console output

Subprocess stderr is inherited — logs go straight to the terminal. With 2–3 models the interleaving is acceptable. For cleaner output, add `[model]` prefix via a transform stream, or suppress per-test output and only print the final comparison.

### Fallback

- `--sequential` flag (or absence of `--parallel`) keeps the current loop
- Single-model evals (no `models:` field) are unaffected

## Steps

1. Create `shell/ai-evaluation/src/eval-subprocess.ts` — reads env + brain.eval.yaml, resolves brain package, boots App with model override, runs suite, writes JSON to stdout
2. Add `--parallel` flag to eval runner — spawns subprocesses instead of sequential loop
3. Collect JSON results, feed to `writeModelComparisonReport`
4. Per-subprocess git remote paths

## Risks

- **Memory** — Each subprocess boots a full Shell with SQLite DBs, plugins. With 4+ models, memory spikes. Document limits.
- **OpenAI rate limits** — Each subprocess calls the OpenAI embeddings API independently. Parallel starts multiply embedding requests; may hit per-minute rate limits on large test suites.

Port conflicts are not a risk — A2A and other interfaces are in `evalDisable` for brain models, so they don't bind ports during eval runs.

## Verification

1. `bun run eval --parallel` with 2 models completes in ~60% of sequential time
2. Results are identical to sequential run (same pass/fail per test per model)
3. No port conflicts, no CLIENT_CLOSED errors
4. `bun run eval` (no `--parallel`) still works as before
5. Single-model eval (no `models:` field) is unaffected
