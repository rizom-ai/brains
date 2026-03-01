# Plan: Obsidian Bases (.base file) Generation

## Context

The obsidian-vault plugin generates templates and Metadata Menu fileClasses from entity schemas. We want to also generate Obsidian Bases `.base` files — YAML files that create database-like views (tables, grouped views) over entity notes. This gives users instant table/kanban views of their content without manual setup.

## What We're Generating

1. **Per-entity .base files** at vault root (e.g., `Posts.base`, `Links.base`, `Social Posts.base`)
   - Table view with all schema fields as columns
   - If entity has a `status` enum: second view grouped by status
2. **Pipeline.base** — cross-type view of all non-published items from entities with status fields

## Output Examples

**Posts.base:**

```yaml
filters:
  and:
    - file.inFolder("post")
views:
  - type: table
    name: All Posts
    order:
      - file.name
      - title
      - status
      - publishedAt
      - seriesName
  - type: table
    name: By Status
    groupBy:
      property: status
      direction: ASC
    order:
      - file.name
      - title
      - status
      - publishedAt
```

**Pipeline.base:**

```yaml
filters:
  and:
    - or:
        - file.inFolder("post")
        - file.inFolder("social-post")
        - file.inFolder("newsletter")
    - 'status != "published"'
views:
  - type: table
    name: Pipeline
    groupBy:
      property: status
      direction: ASC
    order:
      - file.name
      - file.folder
      - status
```

## Key Behaviors

- **Generate-if-missing**: Don't overwrite existing `.base` files (users may customize views)
- **Columns from schema**: Reuse `FieldInfo[]` from schema introspector, exclude `entityType` field
- **Human-friendly filenames**: `toDisplayName("social-post")` → `"Social Posts"` → `Social Posts.base`
- **File watcher**: Already ignores `.base` (only processes `.md` and images)

## Step 1: Add `toDisplayName` to shared/utils

**File:** `shared/utils/src/string-utils.ts`

```typescript
export function toDisplayName(entityType: string): string {
  const words = entityType.split("-");
  const titleCased = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  titleCased[titleCased.length - 1] = pluralize(
    titleCased[titleCased.length - 1]!,
  );
  return titleCased.join(" ");
}
```

- Export from `shared/utils/src/index.ts`
- Add tests in `shared/utils/test/string-utils.test.ts`

## Step 2: Create `base-generator.ts` (tests first)

**Test:** `plugins/obsidian-vault/test/base-generator.test.ts`
**Create:** `plugins/obsidian-vault/src/lib/base-generator.ts`

Two pure functions:

```typescript
interface BaseGeneratorResult {
  filename: string; // "Posts.base"
  content: string; // YAML content (no --- delimiters)
  hasStatus: boolean; // for pipeline aggregation
}

export function generateBase(
  entityType: string,
  fields: FieldInfo[],
): BaseGeneratorResult;
export function generatePipelineBase(
  entries: { entityType: string; fields: FieldInfo[] }[],
): string | null;
```

- `generateBase`: filters by `file.inFolder(entityType)`, builds column order from fields (excluding `entityType`), adds grouped-by-status view if status exists
- `generatePipelineBase`: combines all status-bearing types with `or` clause, filters `status != "published"`, groups by status. Returns null if no entries.
- Uses `toYaml` for output (plain YAML, no frontmatter delimiters)

## Step 3: Wire into plugin sync + add `existsFile` dep

**File:** `plugins/obsidian-vault/src/plugin.ts`

Add to deps interface:

```typescript
existsFile: (path: string) => boolean; // default: existsSync
```

In `sync()`, after the per-type template/fileClass loop:

1. Call `generateBase(entityType, fields)` for each type
2. Write to `join(context.dataDir, result.filename)` only if `!this.deps.existsFile(path)`
3. Collect status-bearing types, then call `generatePipelineBase()` and write `Pipeline.base`
4. Add `bases: string[]` to return value

## Step 4: Update plugin tests

**File:** `plugins/obsidian-vault/test/plugin.test.ts`

- Add `existsFile` to mock deps (default: returns `false`)
- Test: `.base` files written at vault root (`/tmp/test-vault/Posts.base`)
- Test: `Pipeline.base` generated when status fields exist
- Test: existing `.base` files not overwritten
- Test: `bases` in result data

## Verification

- `bun test shared/utils/` — toDisplayName tests
- `bun test plugins/obsidian-vault/` — all generator + plugin tests
- `bun run typecheck`
- `bun run lint`

## Key Files

| File                                                 | Change                                     |
| ---------------------------------------------------- | ------------------------------------------ |
| `shared/utils/src/string-utils.ts`                   | Add `toDisplayName`                        |
| `shared/utils/src/index.ts`                          | Export `toDisplayName`                     |
| `shared/utils/test/string-utils.test.ts`             | Add tests                                  |
| `plugins/obsidian-vault/src/lib/base-generator.ts`   | **New** — generates .base YAML             |
| `plugins/obsidian-vault/test/base-generator.test.ts` | **New** — unit tests                       |
| `plugins/obsidian-vault/src/plugin.ts`               | Add `existsFile` dep, wire base generation |
| `plugins/obsidian-vault/test/plugin.test.ts`         | Add `existsFile` mock, base tests          |
