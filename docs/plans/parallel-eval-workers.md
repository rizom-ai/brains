# Plan: Parallel Multi-Model Eval

## Context

Multi-model evals (`brain.eval.yaml` with `models:` list) run sequentially — one model at a time. With 2 models and ~60 test cases each, a full run takes ~5 minutes. Each model run boots a full Shell, runs all test cases, shuts down, resets singletons, then the next model starts.

Adding more models (e.g. `gemini-2.0-flash`, `gpt-4o`) makes it linearly slower. The models don't share state — each gets its own temp DB, eval content copy, and git repo. They're embarrassingly parallel.

## Approach: Subprocesses, Not Workers

~~The original plan proposed Bun Workers for parallelism.~~ Workers are wrong here:

- **Serialization boundary** — `AppConfig` contains class instances that can't cross `postMessage`. Requires re-booting from scratch in each worker, duplicating config resolution.
- **ONNX in workers** — fastembed loads native binaries. No evidence it works across Bun workers without segfaults.
- **Port conflicts** — A2A binds to port 3334. Two workers would crash.
- **Singletons** — Shell, EntityRegistry, etc. are process-global singletons. Workers share module scope in subtle ways.

The simpler fix: `--parallel` using separate `bun` subprocesses. Each subprocess is a fully isolated OS process — its own singletons, its own ports, its own ONNX session. No serialization boundary, no shared state, no new abstractions.

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

### Worker entry point

New file: `shell/ai-evaluation/src/eval-subprocess.ts`

Receives config via environment variables and CLI args:

- `EVAL_MODEL` — model string (e.g. `"gpt-4o-mini"`)
- `AI_API_KEY` — resolved provider key for this model
- `EVAL_DB_BASE` — pre-prepared temp DB path prefix
- `EVAL_JUDGE_MODEL` — model string for the LLM judge
- CLI args: `--test-cases-dir`, `--skip-llm-judge`, `--tags`, etc.

Writes `EvaluationSummary` as JSON to stdout on completion. Stderr for logs.

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

1. Create `shell/ai-evaluation/src/eval-subprocess.ts` — reads env, boots App, runs suite, writes JSON to stdout
2. Add `--parallel` flag to eval runner — spawns subprocesses instead of sequential loop
3. Collect JSON results, feed to `writeModelComparisonReport`
4. Per-subprocess git remote paths

## Risks

- **Memory** — Each subprocess boots a full Shell with SQLite DBs, embeddings, plugins. With 4+ models, memory spikes. Document limits.
- **Port conflicts** — A2A binds to a fixed port. Either disable in eval mode (via `evalDisable`) or assign dynamic ports per subprocess.
- **fastembed cold start** — Each subprocess loads the ONNX model independently. First load is ~3s. Parallel starts may contend on disk I/O.

## Verification

1. `bun run eval --parallel` with 2 models completes in ~60% of sequential time
2. Results are identical to sequential run (same pass/fail per test per model)
3. No port conflicts, no CLIENT_CLOSED errors
4. `bun run eval` (no `--parallel`) still works as before
5. Single-model eval (no `models:` field) is unaffected
