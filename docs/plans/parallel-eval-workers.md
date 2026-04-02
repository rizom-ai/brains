# Plan: Parallel Multi-Model Eval with Bun Workers

## Context

Multi-model evals (`brain.eval.yaml` with `models:` list) run sequentially — one model at a time. With 2 models and ~60 test cases each, a full run takes 5–10 minutes. Each model run boots a full Shell, runs all test cases, shuts down, resets singletons, then the next model starts.

The singleton architecture (`Shell.getInstance`, `EntityService.getInstance`, etc.) prevents running multiple Shells in the same process. `Shell.createFresh` resets singletons before constructing, so two concurrent calls would clobber each other.

## Problem

Sequential model evaluation is slow. Adding more models (e.g. `gemini-2.0-flash`, `gpt-4o`) makes it linearly slower. The models don't share state — each gets its own temp DB, eval content copy, and git repo. They're embarrassingly parallel.

## Solution

Use [Bun Workers](https://bun.sh/docs/api/workers) to run each model eval in an isolated thread. Each worker gets its own module scope — singletons are independent, no conflicts.

### Architecture

```
Main thread                          Worker threads
─────────────                        ──────────────
                                     ┌─────────────────┐
parse brain.eval.yaml               │ Worker: gpt-4o   │
prepare env per model ──────────────▶│  boot Shell      │
  (temp dirs, DB copies,             │  run test suite  │
   git repos)                        │  post summary    │
                                     └────────┬────────┘
                                              │
                                     ┌────────▼────────┐
                                     │ Worker: claude   │
                                     │  boot Shell      │
                                     │  run test suite  │
                                     │  post summary    │
                                     └────────┬────────┘
                                              │
collect summaries ◀───────────────────────────┘
write comparison report
exit
```

### Worker entry point

New file: `shell/ai-evaluation/src/eval-worker.ts`

Receives via `workerData`:

- `model`: model string (e.g. `"gpt-4o-mini"`)
- `providerEnv`: env vars for this model's provider (AI_API_KEY set to the right key)
- `evalDbBase`: pre-prepared temp DB path prefix
- `config`: serialized `AppConfig`
- `testCasesDirs`: array of test case directories
- `evalOptions`: skip LLM judge, tags, filters, etc.
- `judgeModel`: model string for the LLM judge (from `judge:` field)

Posts back via `postMessage`:

- `{ type: "summary", model, summary: EvaluationSummary }`
- `{ type: "error", model, error: string }`
- `{ type: "log", model, message: string }` (for progress output)

### Main thread changes

In `run-evaluations.ts`, the multi-model block changes from:

```ts
for (const model of models) {
  // sequential: boot, run, shutdown, reset
}
```

to:

```ts
const workers = models.map((model) => {
  const evalDbBase = prepareEvalEnvironment(model.replace(/[^a-z0-9-]/gi, "-"));
  const providerKey = resolveProviderKey(model, process.env);

  return new Promise<ModelResult>((resolve, reject) => {
    const worker = new Worker("./eval-worker.ts", {
      workerData: {
        model,
        providerEnv: { ...process.env, AI_API_KEY: providerKey },
        evalDbBase,
        config,
        testCasesDirs,
        evalOptions,
        judgeModel: judge ?? "claude-haiku-4-5",
      },
    });
    worker.on("message", (msg) => {
      if (msg.type === "summary") resolve({ model, summary: msg.summary });
      if (msg.type === "error") reject(new Error(msg.error));
      if (msg.type === "log") console.log(`[${model}] ${msg.message}`);
    });
    worker.on("error", reject);
  });
});

const modelSummaries = await Promise.all(workers);
```

### Environment preparation

`prepareEvalEnvironment` already creates per-model temp dirs with unique suffixes. One change needed: the git remote path is currently shared (`/tmp/brain-eval-git-remote`). Each worker needs its own:

```diff
- const gitRemotePath = "/tmp/brain-eval-git-remote";
+ const gitRemotePath = `/tmp/brain-eval-git-remote-${suffix}`;
```

### Serialization boundary

`AppConfig` contains plugin instances (classes). These can't be sent to a worker via `postMessage` (structured clone doesn't handle classes). Two options:

**Option A: Re-resolve config in worker.** Pass `brainPackage`, `overrides`, and env vars. Worker calls `resolveConfig(mod.default, env, overrides)` itself. Clean but duplicates config resolution.

**Option B: Boot the App in the worker from scratch.** Pass only `brainPackage`, `overrides`, `model`, `apiKey`, and `evalDbBase`. Worker does the full `loadEvalConfig → bootEvalApp` flow. Simplest, most isolated.

**Recommendation: Option B.** Each worker is a self-contained eval run. The main thread only handles environment prep, worker spawning, and result collection.

### Console output

With parallel workers, interleaved console output is unreadable. Options:

1. **Prefix each line** with `[model]` — simple, good enough for 2–3 models
2. **Buffer per-worker output**, print sequentially after all complete — cleaner but no live progress
3. **Print only summary**, suppress per-test output during parallel runs — cleanest

Recommendation: option 1 for now (prefixed lines). The `ConsoleReporter` in each worker prefixes with the model name.

### LLM Judge

The LLM judge uses a dedicated `AIService` instance. Each worker creates its own judge instance — no shared state needed. The judge model (from `judge:` field in brain.eval.yaml) and its API key (resolved via `resolveProviderKey`) are passed to the worker so all workers use the same judge for consistency.

## Steps

### Phase 1: Worker entry point

1. Create `shell/ai-evaluation/src/eval-worker.ts`
2. Receives config via `workerData`, boots App, runs `runEvaluationsCollect`, posts result
3. Handles errors gracefully (posts error message, exits cleanly)

### Phase 2: Main thread orchestration

1. Refactor multi-model block in `run-evaluations.ts` to spawn workers
2. Per-model `prepareEvalEnvironment` with unique git remote paths
3. Collect results via `Promise.all`, write comparison report as before
4. Handle worker failures (partial results — report what completed)

### Phase 3: Console output

1. Workers post `{ type: "log" }` messages instead of writing to stdout
2. Main thread prints with `[model]` prefix
3. Or: suppress per-test output, only show summary

### Phase 4: Fallback

1. Keep `--no-parallel` flag (or `--sequential`) for debugging
2. Single-model evals (no `models:` field) remain unchanged

## Risks

- **Bun Worker API stability** — Workers are stable in Bun but less battle-tested than Node's `worker_threads`. Test thoroughly.
- **Memory** — Each worker boots a full Shell with SQLite DBs, embeddings, plugins. With 4+ models, memory could spike. Monitor and document limits.
- **Port conflicts** — The A2A interface binds to port 3334. In eval mode it should be disabled (via `evalDisable`), but verify workers don't fight over ports.
- **fastembed/ONNX** — The embedding model loads native ONNX binaries. Verify it works correctly across Bun workers (separate ONNX sessions per thread).

## Verification

1. `bun run eval` with 2 models completes in ~50% of sequential time
2. Results are identical to sequential run (same pass/fail per test per model)
3. No singleton conflicts, no CLIENT_CLOSED errors, no port conflicts
4. `bun run eval --sequential` still works as before
5. Single-model eval (no `models:` field) is unaffected
