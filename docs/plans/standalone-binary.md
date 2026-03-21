# Plan: Standalone Binary Distribution

## Context

After removing Matrix native crypto and extracting ONNX embeddings to a sidecar, the brain runtime is pure JS/TS. `bun build --compile` can produce a single executable — no Docker, no node_modules, no bun install.

The goal: `./rover` + `brain.yaml` = running brain.

## Prerequisites

1. **Matrix deprecation** (`docs/plans/chat-interface-sdk.md` phase 1) — removes native `.node` binary
2. **Embedding service extraction** (`docs/plans/embedding-service.md`) — removes ONNX C++ runtime

## What Bun compile gives us

- Single binary per platform (Linux x64, macOS arm64, Windows)
- Cross-compilation via `--target` flag
- Static file embedding for assets
- Built-in SQLite (no native dep)
- All JS/TS dependencies bundled

## Open questions

- **`import.meta.dir`**: seed content paths use this. In a compiled binary, there's no real filesystem path. Need to either embed seed content in the binary or resolve paths relative to the binary location.
- **CSS theme files**: imported with `{ type: "text" }`. Should embed correctly but needs verification.
- **brain.yaml**: read from CWD at runtime — works with a compiled binary.
- **brain-data/**: created at runtime in CWD — works.
- **SQLite DB**: created at runtime — Bun's built-in SQLite works in compiled binaries.
- **Binary size**: Bun runtime is ~90MB. With all plugins bundled, estimate ~100-120MB total.

## Distribution model

```
Download:
  rover-linux-x64      (single binary)
  rover-macos-arm64    (single binary)

Setup:
  mkdir my-brain && cd my-brain
  ./rover init              # generates brain.yaml + .env template + seed content
  vim brain.yaml            # pick preset, set domain
  vim .env                  # add API keys
  ./rover start             # running brain
```

## Build pipeline

Add to CI:

```bash
bun build --compile --target=bun-linux-x64 shell/app/src/runner.ts --outfile dist/rover-linux-x64
bun build --compile --target=bun-darwin-arm64 shell/app/src/runner.ts --outfile dist/rover-macos-arm64
```

Publish as GitHub release assets.

## Sequence

1. Matrix deprecation + ONNX extraction (remove native deps)
2. Verify `bun build --compile` works with the brain
3. Fix `import.meta.dir` / seed content resolution for compiled mode
4. Add `rover init` command for scaffolding
5. CI pipeline for cross-platform builds
6. GitHub releases
