# Plan: Frontmatter-Based Entity Type Detection

## Context

Directory-sync determines entity type entirely from the file path (directory name). When a user creates a note anywhere in Obsidian using a template that includes `entityType: post` in frontmatter, directory-sync ignores it and types the file based on its location (e.g., root files become `base`).

Goal: let users create notes anywhere in the vault, pick a template, and have directory-sync use the `entityType` from frontmatter to import correctly and auto-organize the file into the right directory.

## How it works

1. During import, after reading a file, extract `entityType` from YAML frontmatter (simple regex — no YAML parser needed)
2. If found and registered, override the path-based entity type
3. After successful import, if the file is in the wrong directory, relocate it (e.g., root `my-post.md` → `post/my-post.md`)
4. File watcher handles the move safely: delete at old path is a no-op (entity was imported under new type), add at new path is skipped (same content hash)

After one cycle, the file is in the correct directory and path-based detection takes over. The `entityType` field gets stripped from frontmatter by Zod on export (not in adapter schemas), but that's fine — the file is already in the right place.

## Implementation Steps

### Step 1: `extractEntityTypeFromFrontmatter` + tests

**File:** `plugins/directory-sync/src/lib/file-operations.ts`

Pure exported function using regex to extract `entityType` from YAML frontmatter. Strips quotes if present.

```typescript
export function extractEntityTypeFromFrontmatter(
  content: string,
): string | undefined;
```

**Tests:** valid frontmatter, no frontmatter, no entityType field, quoted values, trailing whitespace.

### Step 2: `relocateFile` method + tests

**File:** `plugins/directory-sync/src/lib/file-operations.ts`

Add `renameSync` to fs imports. New method on `FileOperations`:

```typescript
relocateFile(currentRelativePath: string, entityId: string, entityType: string): string | undefined
```

Uses existing `getFilePath()` to compute target, creates directory if needed, returns new relative path (or `undefined` if already correct).

**Tests:** root→subdirectory move, already-correct path returns undefined, creates target directory.

### Step 3: Wire into import pipeline

**File:** `plugins/directory-sync/src/lib/import-pipeline.ts`

In `importFile`, after `readEntity()`:

- Call `extractEntityTypeFromFrontmatter(rawEntity.content)`
- If valid registered type, override `rawEntity.entityType`

In `processEntityImport`, after successful upsert:

- If file is in wrong location, call `deps.fileOperations.relocateFile()`
- Relocation failure is non-fatal (entity already imported correctly)

### Step 4: Update types

**File:** `plugins/directory-sync/src/types.ts`

- Add `relocated: number` and `relocatedFiles: string[]` to `ImportResult`
- Add `relocateFile` and `getFilePath` to `IFileOperations` interface

### Step 5: Verification

- `bun run typecheck`
- `bun test plugins/directory-sync/`
- `bun run lint`
- Manual test: create a root file with `entityType: post` frontmatter, run import, verify file moves to `post/`

## Key files

| File                                                  | Change                                                      |
| ----------------------------------------------------- | ----------------------------------------------------------- |
| `plugins/directory-sync/src/lib/file-operations.ts`   | Add `extractEntityTypeFromFrontmatter()` + `relocateFile()` |
| `plugins/directory-sync/src/lib/import-pipeline.ts`   | Override entityType from frontmatter, relocate after import |
| `plugins/directory-sync/src/types.ts`                 | Update `ImportResult`, `IFileOperations`                    |
| `plugins/directory-sync/test/file-operations.test.ts` | Tests for new functions                                     |
