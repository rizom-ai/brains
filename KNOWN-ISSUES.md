# Known Issues

This document tracks known issues that don't affect functionality but may appear during development.

## Turbo Warning: @emnapi Dependencies

### Issue

When running Turbo commands, you may see the warning:

```
WARNING Unable to calculate transitive closures: No lockfile entry found for '@emnapi/core'
WARNING Unable to calculate transitive closures: No lockfile entry found for '@emnapi/wasi-threads'
```

### Cause

This warning is caused by Tailwind CSS v4's bundled WASM dependencies (`@tailwindcss/oxide-wasm32-wasi`) which bundle `@emnapi/*` packages internally. Turbo's dependency resolution doesn't properly handle these bundled dependencies.

### Impact

**None** - This warning doesn't affect:

- Build processes
- Type checking
- Testing
- Runtime functionality
- Package installation

All Turbo commands complete successfully despite the warning.

### Packages Affected

- `@brains/site-builder-plugin` (uses Tailwind CSS v4)
- `@brains/ui-library` (uses Tailwind CSS v4)

### Resolution Status

This is a known interaction issue between:

- Turbo's transitive dependency resolution
- Tailwind CSS v4's bundled WASM approach

The issue will likely be resolved when either:

1. Turbo improves handling of bundled dependencies
2. Tailwind CSS changes their bundling approach in a future version

### Workaround

No workaround needed as functionality is not affected. The warning can be safely ignored.

## Bun JIT miscompiles the StyleX media-query tokenizer

### Issue

In a process that compiles StyleX declarations with `@stylexjs/babel-plugin`, compiles start failing after a few dozen media-query parses:

```
error: .../operator-frame.styles.ts: Invalid media query syntax.
```

Which file fails depends on how many media queries were parsed before it, so the failure moves around and looks like a flaky test.

### Cause

Bun's optimising JIT tier (JavaScriptCore DFG) miscompiles the css tokenizer that the plugin's `lastMediaQueryWinsTransform` uses once it becomes hot. The tokenizer's end-of-input check and its next-token read then disagree on the same cursor, the parser reports "Expected end of input, got EOF-token", and the plugin rewraps that as the message above. Compiling the same file repeatedly reproduces it: the first three compiles pass and every later one fails. With `BUN_JSC_useDFGJIT=0` all of them pass.

Reproduced with Bun 1.4.0 and 1.4.2 and with `@stylexjs/babel-plugin` 0.19.0 and 0.19.1 (Linux x64).

### Impact

Test suites that load `@brains/build-tools/stylex-test-preload` sit near the threshold: adding a test that compiles one more styles module can tip the whole suite. Production builds have not hit it.

### Packages Affected

- `@brains/operator-view-react`
- `@brains/app-ui-react`
- `@brains/web-chat`

### Workaround

The `test` scripts of the affected packages set `BUN_JSC_useDFGJIT=0`, which disables only the DFG tier for that test process. JSC options are read at process start, so the flag cannot live in the preload itself. Drop the flag once a Bun release no longer reproduces the probe above.

## Other Known Issues

_No other known issues at this time._

---

Last updated: September 2026
