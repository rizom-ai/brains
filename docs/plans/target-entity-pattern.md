# Plan: Target Entity Pattern

## Problem

`system_create` has an `options: Record<string, unknown>` bag for passing handler-specific params. The image handler uses `targetEntityType`/`targetEntityId` inside options to set a cover image on an entity after generation. But:

- Agents can't reliably put named params into a generic `options` bag — they pass them top-level
- Zod strips unknown top-level keys, so the params get silently dropped
- The `options` bag is untyped — no discoverability, no validation

## Design

`targetEntityType` and `targetEntityId` become first-class fields on `createInputSchema`. They express a general pattern: "create X and attach it to Y."

```typescript
export const createInputSchema = z.object({
  entityType: z.string().describe("Entity type to create"),
  title: z.string().optional().describe("Title for the entity"),
  prompt: z.string().optional().describe("Prompt for AI generation"),
  content: z.string().optional().describe("Direct content to store"),
  targetEntityType: z
    .string()
    .optional()
    .describe("Attach to this entity type after creation"),
  targetEntityId: z
    .string()
    .optional()
    .describe("Attach to this entity ID after creation"),
});
```

The `options` bag is removed. Any handler-specific params that aren't covered by the standard fields go through handler-specific schemas (validated by the handler, not system_create).

## What "target" means per entity type

Each generation handler decides how to use the target:

| Entity type   | Target behavior                                                      |
| ------------- | -------------------------------------------------------------------- |
| `image`       | Set as cover image on target entity (existing behavior)              |
| `social-post` | Set `sourceEntityType`/`sourceEntityId` in metadata (link to source) |
| `newsletter`  | Set source post reference in metadata                                |
| Others        | Pass through as metadata — handler ignores if not relevant           |

## Steps

### Phase 1: Schema + system_create

1. Add `targetEntityType` and `targetEntityId` to `createInputSchema`
2. Remove `options` field from schema
3. Update `system_create` handler to pass target fields to job data directly (no spread of options)
4. Update agent instructions — remove `options` reference, document target fields as top-level
5. Tests

### Phase 2: Update handlers

1. Image generation handler already reads `targetEntityType`/`targetEntityId` from job data — no change needed
2. Social-media generation handler: if `targetEntityType` is set, store as `sourceEntityType`/`sourceEntityId` in metadata
3. Newsletter generation handler: if `targetEntityType` is set, store as source reference
4. Other handlers: ignore target fields gracefully
5. Tests

### Phase 3: Update eval test cases

1. Remove `options.` prefix from all `argsContain` in test cases
2. Test cases use `targetEntityType` and `targetEntityId` as top-level args
3. Run evals — verify pass rate improves

## Files affected

| Phase | Files | Nature                                            |
| ----- | ----- | ------------------------------------------------- |
| 1     | ~3    | Schema, system_create handler, agent instructions |
| 2     | ~3    | Image, social-media, newsletter handlers          |
| 3     | ~4    | Test case YAML files                              |

## Verification

1. `bun test` — all tests pass
2. `bun run typecheck` clean
3. Agent passes `targetEntityType` top-level (natural behavior)
4. Image generation with target sets cover correctly
5. Eval pass rate improves on cover image test cases
6. No `options` field in `system_create` schema
