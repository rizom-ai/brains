# Plan: Brain CLI Declaration Bundler Cleanup

## Status

Implemented. Follow-up to `cb8c5fe4d refactor(site-builder): complete follow-up cleanup`, which added `@brains/site-composition` to `packages/brain-cli/scripts/bundle-declarations.mjs` because `@rizom/brain build` generated a public `interfaces.d.ts` that leaked an internal `@brains/site-composition` import. The declaration inline package list is now explicit/documented, leak diagnostics identify concrete internal imports, and focused tests cover the policy. The optional auto-discovery spike was intentionally deferred in favor of the explicit allowlist.

## Goal

Make the public declaration bundling path easier to maintain and debug without changing the published `@rizom/brain` API surface.

Specifically:

1. Keep generated `packages/brain-cli/dist/*.d.ts` free of internal `@brains/*` imports.
2. Make the set of inlined declaration packages intentional and discoverable.
3. Improve the failure message when a generated declaration leaks an internal package.
4. Avoid surprising package-boundary changes while preserving the current build behavior.

## Non-goals

- Do not redesign the `@rizom/brain` package exports.
- Do not make currently private workspace packages public npm dependencies.
- Do not remove the final internal-import guard from `packages/brain-cli/scripts/build.ts`.
- Do not change runtime bundling or `sharedExternals` in this cleanup unless a declaration-specific issue requires it.
- Do not generate declarations from built `dist` artifacts; keep the current source-entry declaration pipeline.

## Current state

`packages/brain-cli/scripts/bundle-declarations.mjs` uses a manual allowlist:

```ts
const publicPackages = [
  { name: "@brains/app", dir: "shell/app" },
  { name: "@brains/entity-service", dir: "shell/entity-service" },
  { name: "@brains/templates", dir: "shell/templates" },
  { name: "@brains/utils", dir: "shared/utils" },
  { name: "@brains/site-composition", dir: "shared/site-composition" },
  { name: "@brains/theme-base", dir: "shared/theme-base" },
  { name: "@brains/plugins", dir: "shell/plugins" },
];
```

The script reads each package's `exports` field and aliases those export targets for `rollup-plugin-dts`, so public declarations can inline internal workspace types instead of emitting `@brains/*` imports.

`packages/brain-cli/scripts/build.ts` then checks generated declarations and fails if any still include `@brains/`:

```ts
if (declaration.includes("@brains/")) {
  console.error(
    `Generated declaration '${entry.name}.d.ts' leaks an internal @brains/* import`,
  );
  process.exit(1);
}
```

This guard is useful but not actionable enough: it does not say which package leaked or where to add/adjust an alias.

## Proposed approach

### Part A — Make the allowlist explicit and documented

Keep the existing explicit allowlist, but rename it to describe its purpose, for example:

```ts
const declarationInlinePackages = [
  // ...
];
```

Add short comments for why packages are included:

- public authoring/runtime API exposed by `@rizom/brain`
- shared type-only contract needed by public declarations
- plugin API surface that must be inlined

This keeps behavior stable while making future additions less mysterious.

### Part B — Improve leak diagnostics

Replace the simple `declaration.includes("@brains/")` guard with extraction of leaked internal package specifiers.

Desired failure output:

```txt
Generated declaration 'interfaces.d.ts' leaks internal @brains/* imports:
- @brains/site-composition

If this package is part of the public declaration surface, add it to
packages/brain-cli/scripts/bundle-declarations.mjs declarationInlinePackages.
Otherwise, remove the public export path that exposes it.
```

Also include the generated declaration file path when possible.

### Part C — Add focused tests around declaration-bundler intent

Add tests under `packages/brain-cli/test/` that inspect the scripts rather than running a full package build:

1. The declaration bundler includes required inline packages:
   - `@brains/app`
   - `@brains/plugins`
   - `@brains/site-composition`
2. The build script's internal import guard reports concrete leaked package names.
3. The final generated declarations from an existing local build do not contain `@brains/` when `dist/*.d.ts` exists.

Keep these tests lightweight; the full `@rizom/brain build` remains the integration gate.

### Part D — Optional auto-discovery spike

Evaluate whether the allowlist can be derived from package metadata rather than hardcoded script entries.

Possible package-level metadata:

```json
{
  "brains": {
    "declarationInline": true
  }
}
```

or a central config file:

```txt
packages/brain-cli/declaration-inline-packages.json
```

Decision rule:

- If metadata discovery makes the build path clearer, adopt it.
- If it hides policy or adds indirection, keep the explicit allowlist and comments from Part A.

Do not auto-discover every `@brains/*` workspace package by default; that could accidentally expand the public declaration surface.

## Validation

Run the light checks first:

```bash
bun run --filter @rizom/brain typecheck
bun run --filter @rizom/brain lint
bun run --filter @rizom/brain test
```

Then run the integration gate:

```bash
bun run --filter @rizom/brain build
rg "@brains/" packages/brain-cli/dist/*.d.ts
```

Expected result: the `rg` command finds no internal `@brains/*` imports in generated declaration files.

If docs are linked from an index or manifest later, run:

```bash
bun run docs:check
```

## Exit criteria

- The declaration inlining allowlist is named and documented clearly.
- Build failures identify the exact leaked internal package import(s).
- Tests cover the declaration bundler policy or guard behavior.
- `@rizom/brain build` succeeds.
- Generated `packages/brain-cli/dist/*.d.ts` files contain no internal `@brains/*` imports.

## Risk and tradeoffs

- Keeping the allowlist manual is less automatic but preserves intentionality around public API boundaries.
- Auto-discovery could reduce maintenance but may hide public-surface decisions in package metadata.
- Improving diagnostics is low-risk and likely the highest-value first slice.
