# Plan: @rizom/brain Public Release Readiness

## Context

`@rizom/brain` is ~70% ready for a public npm release. The CLI, build system, in-process boot, and rover model work. But several gaps remain — from blocking issues (no README, no version check) to deferred features (external plugin API, `brain pin`). This plan categorizes everything by release phase.

**v0.1.0 ships rover only.** Ranger and relay are less battle-tested and will be added in a follow-up release.

## Current State

**Working:**

- `brain init <dir>` — scaffolds brain.yaml, .env.example, .gitignore, deploy files
- `brain start` — dual-path boot (monorepo subprocess + bundled in-process)
- `brain chat` — interactive REPL via `--cli` flag
- `brain eval` — evaluation pass-through
- `brain tool <name>` — raw tool invocation
- `brain <command> --remote <url>` — remote MCP HTTP queries
- Build produces `dist/brain.js` (~7MB) + migrations + seed content
- Rover model with presets (minimal, default, pro)
- Database auto-creation + migrations
- Changesets configured for versioning

**Not working / missing:**

- No README.md for npm registry page
- No Bun version validation
- No ANTHROPIC_API_KEY pre-check
- `brain pin` not implemented
- brain.yaml parsing limited to `brain:` + `preset:` only (regex, not full YAML)
- No library exports for external plugin authors (no .d.ts, no barrel export)
- No `brain search` / `brain add` for plugins
- No local-over-global re-exec
- No external plugin loading from brain.yaml

---

## Phase 1: Release Blockers (must-do before v0.1.0)

### 1A. Create README.md

npm requires a top-level README for the registry page.

**File:** `packages/brain-cli/README.md`

Content: brief description, install command (`bun add -g @rizom/brain`), quick start (init → start → chat), link to docs in `docs/` directory, link to GitHub.

The existing `docs/getting-started.md`, `docs/cli-reference.md`, `docs/brain-yaml-reference.md`, and `docs/deployment-guide.md` are thorough — README just needs to link to them.

### 1B. Complete package.json metadata

**File:** `packages/brain-cli/package.json`

Add missing fields:

```json
"homepage": "https://github.com/rizom-ai/brains/tree/main/packages/brain-cli",
"bugs": { "url": "https://github.com/rizom-ai/brains/issues" },
"author": "Rizom AI",
"engines": { "bun": ">=1.3.3" }
```

### 1C. Bun version check at CLI entry

**File:** `packages/brain-cli/src/index.ts` (or `scripts/entrypoint.ts`)

Before any command runs, check `Bun.version` against `1.3.3`. Exit with a clear message if too old. This is critical — the package won't work on older Bun versions and the error would be cryptic.

### 1D. ANTHROPIC_API_KEY pre-validation

**File:** `packages/brain-cli/src/commands/start.ts`

Before booting (in both builtin and subprocess paths), check `process.env.ANTHROPIC_API_KEY`. If missing, return a clear error pointing to `.env.example` rather than letting the app boot and fail on first tool call.

### 1E. E2E smoke test

Create a test that simulates the first-time user flow:

1. Build the package (`bun scripts/build.ts`)
2. Run `brain init` in a temp dir
3. Verify brain.yaml, .env.example, .gitignore exist
4. Optionally boot in `--registerOnly` mode to verify model loads

**File:** `packages/brain-cli/test/e2e.test.ts`

---

## Phase 2: Should-do before release (quality)

### 2A. `brain pin` command

Creates a `package.json` in the brain instance that pins `@rizom/brain` to the current (or specified) version. This enables reproducible deployments.

```bash
brain pin           # pins to currently installed version
brain pin 1.2.0     # pins to specific version
```

**Files:**

- `packages/brain-cli/src/commands/pin.ts` — new command
- `packages/brain-cli/src/run-command.ts` — register the command
- `packages/brain-cli/test/pin.test.ts` — tests

### 2B. Improved boot error messages

Currently `bootBrain` catches errors and returns generic "Boot failed". Should differentiate:

- Database migration failure → "Failed to initialize database at ./data/"
- Plugin schema validation error → "Plugin config error: missing required field X"
- Missing API key → "ANTHROPIC_API_KEY not set"

**File:** `packages/brain-cli/src/commands/start.ts` (the catch block in builtin path)

### 2C. Full brain.yaml validation

Currently uses regex to extract `brain:` and `preset:`. Should use the yaml parser (already a dependency) for proper YAML parsing and validate the schema.

**File:** `packages/brain-cli/src/lib/brain-yaml.ts`

### 2D. Local-over-global re-exec

When `./node_modules/@rizom/brain` exists (user ran `brain pin` + `bun install`), re-exec with the local binary instead of continuing with the global one. Same pattern as eslint/typescript/jest.

**File:** `packages/brain-cli/src/index.ts` — check before running any command

---

## Phase 3: External Plugin API (post-release, needed for plugin ecosystem)

### 3A. Library barrel export

Create a re-export file that surfaces the public API from `@brains/plugins` and `@brains/utils`:

**File:** `packages/brain-cli/src/lib-entrypoint.ts`

Re-exports: EntityPlugin, ServicePlugin, InterfacePlugin, context types, createTool, toolSuccess, toolError, z, Logger, ProgressReporter, entity schema/adapter helpers, messaging types.

All of these already exist in `shell/plugins/src/index.ts` (257 lines) and `shared/utils/src/index.ts` (137 lines).

### 3B. Dual build target

Update the build script to produce two outputs:

- `dist/brain.js` — CLI executable (existing)
- `dist/index.js` — library entry for `import { EntityPlugin } from "@rizom/brain"`

### 3C. TypeScript declarations

Generate `.d.ts` files so plugin authors get IDE support. Either:

- Run `tsc --emitDeclarationOnly` for the library entry
- Or use `bun build --dts` if available in Bun by then

### 3D. Update package.json exports

```json
"exports": {
  ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" },
  "./cli": "./dist/brain.js"
}
```

---

## Phase 4: Plugin Ecosystem (post-release)

### 4A. External plugin loading from brain.yaml

```yaml
plugins:
  - @rizom/brain-plugin-calendar
  - @rizom/brain-plugin-stripe:
      apiKey: "${STRIPE_API_KEY}"
```

Dynamic `import()` at runtime from `node_modules`.

### 4B. `brain search` — search npm for `brain-plugin-*` packages

### 4C. `brain add <plugin>` — install + add to brain.yaml

### 4D. Site/theme overrides from brain.yaml

```yaml
site: "@rizom/site-portfolio"
theme: "./theme.css"
```

---

## Summary

| Phase | Items                                                | Effort    | Blocks Release?   |
| ----- | ---------------------------------------------------- | --------- | ----------------- |
| 1     | README, metadata, Bun check, API key check, E2E test | 1 day     | Yes               |
| 2     | brain pin, error messages, yaml parsing, re-exec     | 2-3 days  | Recommended       |
| 3     | Library exports, dual build, .d.ts                   | 2-3 days  | No (post-release) |
| 4     | Plugin ecosystem (search, add, external loading)     | 1-2 weeks | No (post-release) |

**Minimum viable release:** Phase 1 only (1 day of work).
**Recommended release:** Phase 1 + 2 (3-4 days).
