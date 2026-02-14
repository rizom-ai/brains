# Plan: Frontmatter Schema Normalization

**Status: Done** — Implemented in `d6526b99` (deck, project, link) and `2b095a8f` (newsletter).

## Context

The CMS plan (`docs/plans/sveltia-cms.md`) requires every entity adapter to expose a `frontmatterSchema` property. An audit of all 9 adapters found 4 inconsistencies in how frontmatter schemas are defined. This plan normalizes 3 of them (deck, project, link). Newsletter is handled separately in `docs/plans/newsletter-cleanup.md`.

### Target pattern

Every adapter should follow this structure (established by blog, social-media, note):

```
schemas/foo.ts:
  1. fooStatusSchema        — reusable z.enum(...)
  2. fooFrontmatterSchema   — all fields stored in YAML frontmatter
  3. fooMetadataSchema       — .pick() from frontmatter (query-relevant fields only)
  4. fooSchema               — baseEntitySchema.extend({ metadata: fooMetadataSchema })
```

### Issues found

| Plugin  | Issue                                                       | Risk     |
| ------- | ----------------------------------------------------------- | -------- |
| Deck    | Frontmatter schema local to formatter, status enum mismatch | Low      |
| Project | Status enum inline, no reusable `projectStatusSchema`       | Very low |
| Link    | Entity schema doesn't extend `baseEntitySchema`             | Very low |

Newsletter normalization is handled in `docs/plans/newsletter-cleanup.md`.

## Changes

### 1. Deck — Move frontmatter schema + fix status enum

**Problem**: `deckFrontmatterSchema` is a local const in `plugins/decks/src/formatters/deck-formatter.ts` with `status: z.enum(["draft", "published"])`. But `deckStatusSchema` in `plugins/decks/src/schemas/deck.ts` has `["draft", "queued", "published"]`.

**Fix**:

**File**: `plugins/decks/src/schemas/deck.ts`

- Add `deckFrontmatterSchema` using `deckStatusSchema` for status field:

```typescript
export const deckFrontmatterSchema = z.object({
  title: z.string(),
  slug: z.string().optional(),
  description: z.string().optional(),
  author: z.string().optional(),
  status: deckStatusSchema.default("draft"),
  publishedAt: z.string().datetime().optional(),
  event: z.string().optional(),
  coverImageId: z.string().optional(),
});
```

- Derive `deckMetadataSchema` from frontmatter via `.pick()`:

```typescript
export const deckMetadataSchema = deckFrontmatterSchema
  .pick({
    title: true,
    status: true,
    publishedAt: true,
    coverImageId: true,
  })
  .extend({
    slug: z.string(), // Required in metadata (auto-generated from title)
  });
```

**File**: `plugins/decks/src/formatters/deck-formatter.ts`

- Remove local `deckFrontmatterSchema` const (lines 12-21)
- Import from schemas: `import { deckSchema, deckFrontmatterSchema, type DeckEntity } from "../schemas/deck";`

**Blast radius**: Low. All code uses only `"draft"` and `"published"` values today. Adding `"queued"` to the allowed set doesn't break anything — it just becomes parseable. The `.pick()` derivation preserves all 4 metadata fields currently in use (`slug`, `title`, `status`, `publishedAt`, `coverImageId`).

### 2. Project — Extract status enum

**Problem**: `projectFrontmatterSchema` has `status: z.enum(["draft", "published"])` inline. Other plugins extract this to a named schema (`blogPostStatusSchema`, `linkStatusSchema`, etc.).

**Fix**:

**File**: `plugins/portfolio/src/schemas/project.ts`

- Extract status enum (keep 2 values — project intentionally has no `"queued"` state):

```typescript
export const projectStatusSchema = z.enum(["draft", "published"]);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

export const projectFrontmatterSchema = z.object({
  // ...
  status: projectStatusSchema,
  // ...
});
```

**Blast radius**: None. Pure refactor — same enum values, just named.

### 3. Link — Extend `baseEntitySchema`

**Problem**: `linkSchema` defines `id`, `entityType`, `content`, `contentHash`, `created`, `updated`, `metadata` manually instead of using `baseEntitySchema.extend()`. Field-by-field comparison shows they're identical (link just uses more specific types like `z.literal("link")` and typed metadata).

**Fix**:

**File**: `plugins/link/src/schemas/link.ts`

- Import `baseEntitySchema` from `@brains/plugins`
- Replace manual schema with:

```typescript
export const linkSchema = baseEntitySchema.extend({
  entityType: z.literal("link"),
  metadata: linkMetadataSchema,
});
```

**Blast radius**: Very low. The resulting schema is structurally identical. `baseEntitySchema` fields are: `id` (string), `entityType` (string), `content` (string), `contentHash` (string), `created` (string.datetime), `updated` (string.datetime), `metadata` (record). Link overrides `entityType` to literal and `metadata` to typed — both are valid narrowing.

## Implementation order

1. Deck (most impactful — actual bug fix)
2. Project (trivial extraction)
3. Link (trivial switch to baseEntitySchema)
4. Run `bun run typecheck` + `bun test` across all affected plugins

## Key files

| File                                             | Change                                                     |
| ------------------------------------------------ | ---------------------------------------------------------- |
| `plugins/decks/src/schemas/deck.ts`              | Add `deckFrontmatterSchema`, derive metadata via `.pick()` |
| `plugins/decks/src/formatters/deck-formatter.ts` | Remove local schema, import from schemas                   |
| `plugins/portfolio/src/schemas/project.ts`       | Extract `projectStatusSchema`                              |
| `plugins/link/src/schemas/link.ts`               | Switch to `baseEntitySchema.extend()`                      |

## Verification

1. `bun run typecheck` — no errors
2. `bun test` in `plugins/decks` — all tests pass
3. `bun test` in `plugins/portfolio` — all tests pass
4. `bun test` in `plugins/link` — all tests pass
5. `bun test` across all plugins — no regressions
