# Plan: FileClass Generation + Directory Restructure

## Context

Two issues with the obsidian-vault plugin:

1. **Enum fields**: Templates show only the default value (e.g., `status: draft`). Users can't see or select valid alternatives. The Metadata Menu plugin solves this with **fileClass definitions** — markdown files declaring field types and allowed values as dropdowns.

2. **Directory structure**: Templates currently go to `<dataDir>/templates/` at the vault root. Both templates and fileClasses should be nested under `_obsidian/` to keep the vault root clean.

## Directory Structure (before → after)

```
# Before
templates/post.md
templates/series.md

# After
_obsidian/templates/post.md
_obsidian/templates/series.md
_obsidian/fileClasses/post.md
_obsidian/fileClasses/series.md
```

## FileClass Format (Metadata Menu)

```yaml
---
fields:
  - name: status
    type: Select
    options:
      "0": draft
      "1": queued
      "2": published
  - name: title
    type: Input
  - name: tags
    type: Multi
---
```

Type mapping: `string→Input`, `number→Number`, `boolean→Boolean`, `date→Date`, `enum→Select`, `array→Multi`

## Step 1: Create `fileclass-generator.ts` (tests first)

**Test:** `plugins/obsidian-vault/test/fileclass-generator.test.ts`
**Create:** `plugins/obsidian-vault/src/lib/fileclass-generator.ts`

Converts `FieldInfo[]` (from existing `schema-introspector.ts`) into Metadata Menu fileClass YAML:

```typescript
export function generateFileClass(
  entityType: string,
  fields: FieldInfo[],
): string;
```

- Maps FieldInfo types to Metadata Menu types
- For enum fields, generates `options` object: `{ "0": "draft", "1": "queued", ... }`
- Returns complete markdown with `---` delimiters

## Step 2: Simplify config

**File:** `plugins/obsidian-vault/src/config.ts`

```typescript
export const obsidianVaultConfigSchema = z.object({
  baseFolder: z.string().default("_obsidian"),
});
```

- `templates/` and `fileClasses/` are fixed subdirectories (not configurable)
- Remove `autoSync` — always sync on `system:plugins:ready` (no reason to register the plugin and not sync)
- Remove `templateFolder` — hardcoded as `templates/` under baseFolder

Resolved paths:

- Templates: `<dataDir>/_obsidian/templates/`
- FileClasses: `<dataDir>/_obsidian/fileClasses/`

## Step 3: Wire into `syncTemplates` + update tests

**File:** `plugins/obsidian-vault/src/plugin.ts`

- Update `syncTemplates` to resolve paths through `baseFolder`
- After generating each template, also generate the corresponding fileClass file
- Return data adds `fileClasses: string[]`

**File:** `plugins/obsidian-vault/test/plugin.test.ts`

- Update existing path assertions from `/tmp/test-vault/templates/` to `/tmp/test-vault/_obsidian/templates/`
- Add tests for fileClass file generation

## Verification

- `bun test plugins/obsidian-vault/`
- `bun run typecheck`
- `bun run lint`

## Key Files

| File                                                      | Change                                                |
| --------------------------------------------------------- | ----------------------------------------------------- |
| `plugins/obsidian-vault/src/lib/fileclass-generator.ts`   | **New** — generates fileClass markdown from FieldInfo |
| `plugins/obsidian-vault/test/fileclass-generator.test.ts` | **New** — unit tests                                  |
| `plugins/obsidian-vault/src/config.ts`                    | Simplify to just `baseFolder`                         |
| `plugins/obsidian-vault/src/plugin.ts`                    | Resolve paths via baseFolder, generate fileClasses    |
| `plugins/obsidian-vault/test/plugin.test.ts`              | Update paths, add fileClass tests                     |
