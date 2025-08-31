# Zod Migration Plan: Centralize → 3.25.1 → 4.1.5

## Overview

This document outlines the strategy for upgrading Zod across the Personal Brain monorepo from mixed versions (3.22.4/3.25.1) to 4.1.5, using a centralized import approach through `@brains/utils`.

## Current State Analysis

- **21 packages** using Zod across the monorepo
- **Mixed versions**: Most packages on 3.25.1, but render-service and templates on 3.22.4
- **115 TypeScript files** importing Zod
- **32 files** import from both Zod and @brains/utils (duplication)
- Most imports are simple: `import { z } from "zod"`
- Only one special type import: `ZodRawShape` in plugins/interfaces.ts

## Migration Strategy

### Phase 1: Centralize Zod Exports in @brains/utils

**Goal**: Create single source of truth for Zod imports (no version change yet)

#### Steps:

1. **Add Zod to utils** (`shared/utils/package.json`):

   ```json
   "dependencies": {
     "zod": "^3.22.4"  // Start with lowest current version for safety
   }
   ```

2. **Create centralized export** (`shared/utils/src/zod.ts`):

   ```typescript
   // Re-export everything from zod
   export * from "zod";
   export { z as default } from "zod";

   // Explicit named exports for commonly used items
   export { z, ZodType, ZodSchema, ZodRawShape, ZodError } from "zod";

   // Type exports
   export type { infer as ZodInfer } from "zod";
   ```

3. **Update utils index** (`shared/utils/src/index.ts`):

   ```typescript
   // Zod exports
   export * as zod from "./zod";
   export { z, ZodType, ZodSchema, ZodRawShape, ZodError } from "./zod";
   ```

4. **Update all imports** across the monorepo:
   - Find/replace: `from "zod"` → `from "@brains/utils"`
   - Special case: `import { z, type ZodRawShape } from "zod"` → `import { z, type ZodRawShape } from "@brains/utils"`

5. **Remove direct dependencies**:
   - Remove `"zod"` from all package.json files except `shared/utils/package.json`

6. **Test**:
   ```bash
   bun run typecheck
   bun run test
   ```

### Phase 2: Upgrade to Zod 3.25.1

**Goal**: Align to latest v3 (minimal risk)

#### Steps:

1. **Single version update** in `shared/utils/package.json`:

   ```json
   "dependencies": {
     "zod": "^3.25.1"
   }
   ```

2. **Reinstall dependencies**:

   ```bash
   bun install
   ```

3. **Run tests**:

   ```bash
   bun run typecheck
   bun run test
   bun run lint
   ```

4. **Fix any issues** (unlikely between 3.22 → 3.25)

5. **Commit**:
   ```bash
   git add -A
   git commit -m "chore: upgrade zod to 3.25.1"
   ```

### Phase 3: Upgrade to Zod 4.1.5

**Goal**: Move to Zod 4 with controlled migration

#### Steps:

1. **Update version** in `shared/utils/package.json`:

   ```json
   "dependencies": {
     "zod": "^4.1.5"
   }
   ```

2. **Add compatibility layer** in `shared/utils/src/zod.ts` (if needed):

   ```typescript
   import { z as zod } from "zod";

   // Temporary compatibility shims for v3 → v4
   // Remove once all code is migrated
   const addCompatibilityMethods = (schema: any) => {
     if (!schema.nonstrict && schema.passthrough) {
       schema.nonstrict = schema.passthrough;
     }
     return schema;
   };

   export const z = new Proxy(zod, {
     // Add compatibility handlers if needed
   });
   ```

3. **Run tests** to identify breaking changes:

   ```bash
   bun run typecheck
   bun run test
   ```

4. **Fix breaking changes**:

   #### Error Customization
   - Replace `message:` with `error:`
   - Update `invalidTypeError:` and `requiredError:` to new format

   #### Method Updates
   - `.nonstrict()` → `.passthrough()`
   - Chained `.or()` → `z.union()`
   - Chained `.and()` → `z.intersection()`

   #### Default Values
   - Review `.default()` usage (81 occurrences found)
   - Change to `.prefault()` where old behavior is needed

   #### Error Handling
   - Update `ZodError` catch blocks for intersection types
   - These now throw regular `Error` instead of `ZodError`

5. **Remove compatibility layer** once all fixes are applied

6. **Final testing**:

   ```bash
   bun run typecheck
   bun run test
   bun run lint
   ```

7. **Commit**:

   ```bash
   git add -A
   git commit -m "feat: upgrade zod to 4.1.5

   BREAKING CHANGE: Zod 4 includes several breaking changes:
   - Error customization API changed
   - .nonstrict() replaced with .passthrough()
   - Union/intersection syntax updated
   - Default value behavior changed"
   ```

## Benefits of This Approach

### Phase 1 (Centralization)

- **Zero risk**: No version changes
- **Single source**: All packages use same Zod instance
- **Future-proof**: Makes future upgrades much easier

### Phase 2 (3.25.1)

- **Minimal risk**: Minor version bump within v3
- **Stable baseline**: Ensures all packages on same version before major upgrade
- **Easy rollback**: Can revert to 3.22.4 if issues arise

### Phase 3 (4.1.5)

- **Controlled migration**: All changes in one place (utils)
- **Compatibility option**: Can add temporary shims during migration
- **Simple rollback**: Just change version in one file
- **Performance gains**: Zod 4 offers significant performance improvements

## Timeline Estimate

- **Phase 1**: 1-2 hours (mostly mechanical find/replace)
- **Phase 2**: 30 minutes (should be smooth)
- **Phase 3**: 2-3 hours (depends on breaking changes found)
- **Total**: 4-6 hours

## Rollback Strategy

Each phase provides a clear rollback point:

1. **After Phase 1**: Still on original versions, just centralized
2. **After Phase 2**: Can revert to 3.22.4 in utils only
3. **After Phase 3**: Can revert to 3.25.1 in utils only

## Testing Checklist

After each phase, verify:

- [ ] TypeScript compilation passes
- [ ] All unit tests pass
- [ ] Integration tests pass
- [ ] Linting passes
- [ ] Critical paths tested:
  - [ ] Entity service operations
  - [ ] Job queue processing
  - [ ] Plugin registration
  - [ ] MCP interface
  - [ ] Matrix interface

## Known Breaking Changes (v3 → v4)

Based on analysis, these areas will need attention:

### Files with potential breaking changes:

- 65 files using `.or()`, `.and()`, or error customization
- 81 occurrences of `.default()`
- 20 files using `.describe()` (now replaced with `.meta()`)

### Packages with heavy Zod usage (priority for testing):

1. `@brains/plugins` - Core plugin system
2. `@brains/entity-service` - Entity validation
3. `@brains/messaging-service` - Message schemas
4. `@brains/job-queue` - Job schemas
5. `@brains/content-service` - Content validation

## Success Criteria

- All packages using Zod 4.1.5 through centralized imports
- Zero direct Zod dependencies (except in utils)
- All tests passing
- No runtime errors in development/staging
- Performance improvements measurable in validation-heavy operations

## References

- [Zod v4 Changelog](https://zod.dev/v4/changelog)
- [Zod Migration Guide](https://zod.dev/v4)
- [Community Codemod](https://www.hypermod.io/explore/zod-v4)
