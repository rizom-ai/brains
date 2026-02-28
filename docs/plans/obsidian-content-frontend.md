# Plan: Obsidian Content Creation Frontend

## Context

The Brains system syncs bidirectionally with an Obsidian vault via git-sync → GitHub. The goal is to augment the current flow so Obsidian becomes a better content creation frontend. Concretely: make files created in Obsidian import cleanly into Brains without manual fixes.

Deliverable: **Template sync** — generate Obsidian templates per entity type so "Create from template" produces import-ready files with correct frontmatter. The templates themselves serve as schema documentation (self-documenting).

## Design

A **ServicePlugin** at `plugins/obsidian-vault/` (package `@brains/obsidian-vault`). It introspects all registered entity types at runtime, extracts their frontmatter schemas, and writes template files to the vault.

### How it works

- Uses `context.entityService.getEntityTypes()` to discover all entity types
- Uses `context.entities.getEffectiveFrontmatterSchema(type)` to get the merged Zod schema (including extensions)
- Introspects each Zod schema to extract field names, types, required/optional, enums, defaults
- Generates **Obsidian template files** (YAML frontmatter with sensible defaults + `{{title}}` placeholder)
- Writes to `context.dataDir` — git-sync picks them up and pushes to vault

### Key design decisions

**Templates go in `.obsidian/templates/`** — directory-sync skips dotfile directories, so these won't be imported as entities. This also matches Obsidian's default template folder.

**Listens to `system:plugins:ready`** — auto-generates templates after all entity types are registered (when `autoSync: true`).

**Targets core Obsidian Templates plugin** — uses `{{title}}` and `{{date}}` placeholders (not Templater community plugin).

## Implementation Steps

Work one file at a time. Typecheck + test after each step.

### Step 1: Package scaffold

Create `plugins/obsidian-vault/` with:

- `package.json` — deps: `@brains/plugins`, `@brains/utils`; devDeps: `@brains/eslint-config`, `@brains/typescript-config`, `@types/bun`
- `tsconfig.json` — extends `@brains/typescript-config/base.json`
- `.eslintrc.cjs` — extends `@brains/eslint-config`
- `src/index.ts` — empty export

Run `bun install` to link workspace.

### Step 2: Schema introspector (`src/lib/schema-introspector.ts` + `test/schema-introspector.test.ts`)

Pure function — no context dependencies.

```typescript
interface FieldInfo {
  name: string;
  type: "string" | "number" | "boolean" | "array" | "enum" | "date" | "unknown";
  required: boolean;
  defaultValue?: unknown;
  enumValues?: string[];
}

function introspectSchema(schema: z.ZodObject<z.ZodRawShape>): FieldInfo[];
```

Unwraps `ZodOptional`, `ZodDefault`, `ZodNullable` to find the base type. Uses `instanceof` checks for `z.ZodString`, `z.ZodNumber`, `z.ZodEnum`, `z.ZodArray`, `z.ZodBoolean`, `z.ZodDate`.

Tests: pass in real-ish Zod schemas covering strings, optionals, enums, arrays, defaults, dates.

### Step 3: Template generator (`src/lib/template-generator.ts` + `test/template-generator.test.ts`)

Pure function — takes `FieldInfo[]` + entity type, returns markdown string.

```typescript
function generateTemplate(entityType: string, fields: FieldInfo[]): string;
```

Default value logic:

- `title` field → `"{{title}}"` (Obsidian variable)
- `status` enum → `"draft"` (first enum value)
- Other enums → first value
- Strings → `""`
- Dates → `"{{date}}"` for `created`/`updated`, `""` otherwise
- Arrays → `[]`
- Booleans → `false`
- Numbers → leave empty
- `entityType` field → the literal entity type name

Body: `<!-- Write your content here -->`

Tests: verify YAML frontmatter structure, `{{title}}` substitution, enum defaults, entity type literal.

### Step 4: Config (`src/config.ts`)

```typescript
const obsidianVaultConfigSchema = z.object({
  templateFolder: z.string().default(".obsidian/templates"),
  autoSync: z.boolean().default(false),
});
```

### Step 5: Plugin + tools (`src/plugin.ts` + `test/plugin.test.ts`)

`ObsidianVaultPlugin extends ServicePlugin<ObsidianVaultConfig>`

**`onRegister()`:**

- If `autoSync`, subscribe to `system:plugins:ready` and run sync

**`getTools()`** — one MCP tool:

- `obsidian-vault_sync-templates` — generate templates for all (or filtered) entity types, write to `{dataDir}/{templateFolder}/{entityType}.md`

Tool logic:

1. Calls `context.entityService.getEntityTypes()`
2. For each type, calls `context.entities.getEffectiveFrontmatterSchema(type)`
3. Runs `introspectSchema()` → `generateTemplate()`
4. Writes files via `fs.mkdirSync` + `fs.writeFileSync` to `context.dataDir`
5. Returns `{ success: true, data: { generated: ["post", "deck", ...] } }`

Tests (using `createServicePluginHarness`):

- Tool is registered
- `sync-templates` generates correct files (mock fs or use temp dir)
- Handles entity types with no frontmatter schema gracefully (skip)

### Step 6: Exports (`src/index.ts`)

```typescript
export { ObsidianVaultPlugin, obsidianVaultPlugin } from "./plugin";
export { obsidianVaultConfigSchema, type ObsidianVaultConfig } from "./config";
```

Factory function:

```typescript
export function obsidianVaultPlugin(config?: Partial<ObsidianVaultConfig>) {
  return new ObsidianVaultPlugin(config);
}
```

### Step 7: Register in professional-brain

Add to `apps/professional-brain/brain.config.ts` — after all entity plugins, before site-builder:

```typescript
obsidianVaultPlugin({ autoSync: true }),
```

Add `"@brains/obsidian-vault": "workspace:*"` to package.json deps.

### Step 8: Verification

- `bun run typecheck`
- `bun test plugins/obsidian-vault/`
- `bun run lint`
- Run the brain and execute `obsidian-vault_sync-templates` via MCP to verify real output

## Key files to reference

| What                         | File                                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| ServicePlugin pattern        | `plugins/link/src/index.ts`                                                                                |
| Entity type discovery        | `context.entityService.getEntityTypes()` — `shell/entity-service/src/types.ts:198`                         |
| Frontmatter schema access    | `context.entities.getEffectiveFrontmatterSchema(type)` — `shell/plugins/src/service/context.ts`            |
| Data directory               | `context.dataDir` — `shell/plugins/src/service/context.ts:173`                                             |
| `system:plugins:ready` event | `shell/core/src/shell.ts:149`                                                                              |
| Real frontmatter schemas     | `plugins/blog/src/schemas/blog-post.ts`, `plugins/note/src/schemas.ts`, `plugins/link/src/schemas/link.ts` |
| Package scaffold             | `plugins/link/package.json`, `tsconfig.json`, `.eslintrc.cjs`                                              |
| Test harness                 | `createServicePluginHarness` from `@brains/plugins/test`                                                   |
