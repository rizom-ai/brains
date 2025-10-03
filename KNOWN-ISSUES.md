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

## Other Known Issues

_No other known issues at this time._

---

Last updated: January 2025
