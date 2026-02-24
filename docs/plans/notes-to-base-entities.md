# Notes → Base Entities

## Context

Notes are the most fundamental entity type in the system — they're just markdown files. Currently they have entityType `"note"` and live in `brain-data/note/`, but conceptually they should be base entities living at the root of `brain-data/`. This change makes notes use entityType `"base"`, so directory-sync stores them at the data root alongside other top-level files.

## Key Design Decision

The shell initializer already registers a bare-bones `"base"` adapter (no title extraction, no metadata). The note plugin should **take over** base entity registration, providing its richer adapter (title extraction from frontmatter/H1, metadata population). To avoid a double-registration conflict, the shell initializer defers its fallback base adapter to AFTER plugins initialize, and only registers it if no plugin has claimed `"base"`.

## Changes

### 1. Shell initializer — deferred fallback

**`shell/core/src/initialization/shellInitializer.ts`**

- Extract the base entity **display template** registration into its own call (always runs, before plugins)
- Move `registerBaseEntitySupport()` (the adapter) to AFTER `initializePlugins()`
- Guard it: `if (!entityRegistry.hasEntityType("base"))` — only register the bare fallback if no plugin claimed it

### 2. Note plugin — register as `"base"`

**`plugins/note/src/schemas/note.ts`**

- `z.literal("note")` → `z.literal("base")`

**`plugins/note/src/adapters/note-adapter.ts`**

- `entityType: "note"` → `entityType: "base"` (constructor + `fromMarkdown`)

**`plugins/note/src/plugin.ts`**

- `context.entities.register("note", ...)` → `context.entities.register("base", ...)`

**`plugins/note/src/tools/index.ts`**

- `entityType: "note"` → `entityType: "base"` in `createEntity` call

**`plugins/note/src/handlers/noteGenerationJobHandler.ts`**

- Line 99: `entityType: "note"` → `entityType: "base"`

### 3. App configs

**`apps/professional-brain/brain.config.ts`**

- Entity route key `note:` → `base:`

**`apps/professional-brain/brain.eval.config.ts`**

- Entity route key `note:` → `base:`

### 4. Portfolio plugin search types

**`plugins/portfolio/src/tools/index.ts`**

- `["note", "link", "post", "topic"]` → `["base", "link", "post", "topic"]`

### 5. Note plugin tests

**`plugins/note/test/adapter.test.ts`**

- `createTestEntity<Note>("note", ...)` → `"base"`
- `expect(adapter.entityType).toBe("note")` → `"base"`
- `expect(result.entityType).toBe("note")` → `"base"`

Other note test files (tools.test.ts, plugin.test.ts, handler test) don't assert entityType directly — no changes needed.

### 6. Files that do NOT change

~30 test files across shell/ and other plugins/ use `"note"` as generic example test data with their own inline schemas. These are NOT testing the actual note entity type and should be left as-is.

## Data Migration

Copy existing note files to the root (same approach as the identity/profile rename):

```bash
# For each app with brain-data/note/:
cp brain-data/note/*.md brain-data/
# For each app with seed-content/note/:
cp seed-content/note/*.md seed-content/
```

Database migration (Drizzle SQL) to rename existing rows:

```sql
UPDATE entities SET entityType = 'base' WHERE entityType = 'note';
UPDATE embeddings SET entity_type = 'base' WHERE entity_type = 'note';
```

## Execution Order

1. Update shellInitializer (deferred fallback)
2. Update note schema → adapter → plugin → tools → handler
3. Update app configs
4. Update portfolio plugin
5. Update note tests
6. Copy seed-content/brain-data files
7. Add Drizzle SQL migration
8. `bun run typecheck`, `bun test`, `bun run lint`
9. Commit

## Verification

1. `bun run typecheck` — 54 packages pass
2. `bun test` — all tests pass
3. `bun run lint` — 0 errors
4. Grep: `grep -r '"note"' --include='*.ts' plugins/note/src/` should return 0 results
