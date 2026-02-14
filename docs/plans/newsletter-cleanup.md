# Plan: Newsletter Plugin Cleanup

**Status: Done** — Implemented in `2b095a8f`.

## Context

The newsletter plugin hasn't been actively used yet. An audit found several design issues alongside the frontmatter schema normalization needed for CMS. Since we're touching newsletter anyway for the frontmatter work, now is the right time to clean up all issues in one pass.

This plan replaces the newsletter portion of `docs/plans/frontmatter-normalization.md` (which will be updated to cover only deck, project, link).

## Changes

### 1. Frontmatter schema normalization

**Problem**: No separate `frontmatterSchema`. `newsletterMetadataSchema` is used directly as frontmatter in the adapter. Breaks uniform pattern needed by CMS config generator.

**Fix** in `plugins/newsletter/src/schemas/newsletter.ts`:

- Rename current `newsletterMetadataSchema` → `newsletterFrontmatterSchema`
- Derive `newsletterMetadataSchema` via `.pick()` (all 6 fields — newsletter genuinely needs them all for queries)
- Export `newsletterFrontmatterSchema` so the adapter can import it

**Fix** in `plugins/newsletter/src/adapters/newsletter-adapter.ts`:

- Import `newsletterFrontmatterSchema`
- Use it in `parseMarkdownWithFrontmatter()` calls (lines 34, 50)
- Keep `newsletterMetadataSchema` for type usage (shape unchanged)

**Blast radius**: None — `.pick()` selects all fields, identical shape.

### 2. Fix partial entity creation hack

**Problem**: Generation handler (line ~249) creates a full Newsletter object with placeholder values (`id: ""`, `contentHash: ""`, `created: ""`, `updated: ""`) just to call `newsletterAdapter.toMarkdown()`. Fragile and violates schema integrity.

**Fix** in `plugins/newsletter/src/handlers/generation-handler.ts`:

- Replace `newsletterAdapter.toMarkdown({...})` with direct call to `generateMarkdownWithFrontmatter(content, metadata)` from `@brains/plugins`
- This is exactly what `toMarkdown()` does internally — skip the intermediary

**Before**:

```typescript
const markdownContent = newsletterAdapter.toMarkdown({
  id: "",
  entityType: "newsletter",
  content,
  contentHash: "",
  created: "",
  updated: "",
  metadata,
});
```

**After**:

```typescript
const markdownContent = generateMarkdownWithFrontmatter(content, metadata);
```

### 3. Fix hard-coded source entity type

**Problem**: Datasource (line ~150) assumes source entities are always `"post"` type and hard-codes `/posts/` URL prefix. Breaks if newsletters reference other entity types.

**Fix** in `plugins/newsletter/src/schemas/newsletter.ts`:

- Add `sourceEntityType` to frontmatter schema (optional, defaults to `"post"` for backward compat):
  ```typescript
  sourceEntityType: z.string().optional(), // e.g., "post"
  ```

**Fix** in `plugins/newsletter/src/handlers/generation-handler.ts`:

- Persist `sourceEntityType` to metadata when creating newsletter

**Fix** in `plugins/newsletter/src/datasources/newsletter-datasource.ts`:

- Read `newsletter.metadata.sourceEntityType ?? "post"` instead of hard-coding `"post"`
- Use `entityRouteConfig` to resolve URL prefix instead of hard-coding `/posts/`

### 4. Add missing tests

**4a. Adapter test** — `plugins/newsletter/test/newsletter-adapter.test.ts`

- `toMarkdown()` serializes metadata as frontmatter + content as body
- `fromMarkdown()` parses frontmatter back to metadata
- Handles content with/without existing frontmatter
- `extractMetadata()` returns entity metadata
- Round-trip: `fromMarkdown(toMarkdown(entity))` preserves data

**4b. Source entity resolution test** — add to `plugins/newsletter/test/datasources/newsletter-datasource.test.ts`

- Test that `sourceEntityType` is used when present
- Test fallback to `"post"` when `sourceEntityType` is missing (backward compat)

### 5. Update frontmatter-normalization plan

Remove newsletter section from `docs/plans/frontmatter-normalization.md`. That plan should only cover deck, project, and link.

## Files

| File                                                                | Change                                                                                         |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `plugins/newsletter/src/schemas/newsletter.ts`                      | Add `newsletterFrontmatterSchema`, derive metadata via `.pick()`, add `sourceEntityType` field |
| `plugins/newsletter/src/adapters/newsletter-adapter.ts`             | Use `newsletterFrontmatterSchema` for parsing                                                  |
| `plugins/newsletter/src/handlers/generation-handler.ts`             | Use `generateMarkdownWithFrontmatter()` directly, persist `sourceEntityType`                   |
| `plugins/newsletter/src/datasources/newsletter-datasource.ts`       | Use `sourceEntityType` from metadata, resolve URL via config                                   |
| `plugins/newsletter/test/newsletter-adapter.test.ts`                | New: adapter unit tests                                                                        |
| `plugins/newsletter/test/datasources/newsletter-datasource.test.ts` | Add source entity type tests                                                                   |
| `docs/plans/frontmatter-normalization.md`                           | Remove newsletter section                                                                      |

## Implementation order

1. Schema changes (frontmatter + sourceEntityType)
2. Adapter update (use frontmatterSchema)
3. Generation handler fix (remove partial entity hack, persist sourceEntityType)
4. Datasource fix (use sourceEntityType, resolve URLs)
5. Tests (adapter, datasource additions)
6. Update frontmatter-normalization plan
7. `bun run typecheck` + `bun test` in `plugins/newsletter`

## Out of scope

**Job monitoring memory leak** — `monitorGenerationJob` creates per-job subscriptions that leak if jobs hang. Same pattern exists in social-media plugin. Warrants its own cross-cutting plan covering both plugins (see roadmap).

## Verification

1. `bun run typecheck` — no errors
2. `bun test` in `plugins/newsletter` — all existing + new tests pass
3. `bun test` across all plugins — no regressions (newsletter schema shape unchanged)
