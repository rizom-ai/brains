# Plan: Entity Update & Delete Tools

## Context

The entity service supports full CRUD (`createEntity`, `updateEntity`, `deleteEntity`) but the tool layer only exposes create and generate. Users can't edit or remove content through conversation or MCP. This is a gap for all brains, especially minimal preset users who only have Discord/A2A.

## Approach

Add generic `entity_update` and `entity_delete` tools to the **system plugin**. These work on any entity type, including published content. Destructive operations require explicit user confirmation before executing — the confirmation IS the safety net.

All mutations go through the entity adapter pipeline — never raw content manipulation.

## Adapter-Aware Mutation Flow

Every entity type has an adapter with `fromMarkdown`, `toMarkdown`, `extractMetadata`, and a `frontmatterSchema`. The tools must respect this pipeline:

### Update flow (partial fields)

1. Fetch current entity from DB
2. Deserialize via adapter: `fromMarkdown(entity.content)` → get current frontmatter + body
3. Merge new fields into frontmatter
4. Validate merged frontmatter against `adapter.frontmatterSchema`
5. If validation fails → return error (don't confirm, don't update)
6. Serialize back: `toMarkdown(mergedEntity)` → new content
7. Show diff to user → confirmation prompt
8. On confirm: `entityService.updateEntity(updatedEntity)`

### Update flow (full content replacement)

1. Fetch current entity from DB
2. Parse new content via adapter: `fromMarkdown(newContent)` → validate it parses
3. Validate frontmatter against `adapter.frontmatterSchema`
4. If validation fails → return error with schema violations
5. Show diff (old content vs new content) → confirmation prompt
6. On confirm: `entityService.updateEntity(parsedEntity)`

### Delete flow

1. Fetch current entity from DB
2. If not found → error
3. Show entity title + content preview → confirmation prompt
4. On confirm: `entityService.deleteEntity(entityType, id)`

## Tools

### `entity_update`

- **Input**: `entityType`, `id`, and either `content` (full markdown replacement) or `fields` (partial frontmatter update)
- **Validation**: new content/fields must pass adapter schema BEFORE showing confirmation
- **Confirmation prompt**: shows a **diff** of old content vs new content
- **Published content**: allowed — user sees the diff and confirms

### `entity_delete`

- **Input**: `entityType`, `id`
- **Confirmation prompt**: shows entity **title + content preview** (first few lines)
- **Published content**: allowed — user sees what they're deleting and confirms

## Confirmation Flow

The brain already has confirmation support in the agent service and message interfaces:

1. Tool returns `{ pendingConfirmation: { toolName, description, args } }`
2. Interface shows the confirmation prompt to the user
3. User replies yes/no
4. Agent calls `agentService.confirmPendingAction(conversationId, confirmed)`
5. If confirmed, tool executes the destructive operation

Both update and delete must use this flow. The agent should never silently modify or remove content.

## Steps

### Step 1: Write tests

Tests first, before any implementation:

- `plugins/system/test/entity-update.test.ts`
  - update with partial frontmatter fields → validates against adapter schema → confirmation shown with diff → confirm → entity updated
  - update with full content replacement → validates via adapter.fromMarkdown → confirmation shown with diff → confirm → entity updated
  - update with invalid fields (fails schema) → error returned, no confirmation
  - update published entity → confirmation shown with diff → confirm → entity updated (no unpublish)
  - update → deny → entity unchanged
  - update nonexistent entity → error
- `plugins/system/test/entity-delete.test.ts`
  - delete → confirmation shown with title + preview → confirm → entity deleted
  - delete published entity → confirmation shown with title + preview → confirm → entity deleted
  - delete → deny → entity still exists
  - delete nonexistent entity → error

### Step 2: Implement tools

- `plugins/system/src/tools/entity-update.ts` — validates via adapter, generates diff for confirmation, applies on confirm
- `plugins/system/src/tools/entity-delete.ts` — fetches title + preview for confirmation, deletes on confirm

### Step 3: Register tools

- `plugins/system/src/plugin.ts` — add new tools to `getTools()`

## Key Files

| File                                        | Change                                            |
| ------------------------------------------- | ------------------------------------------------- |
| `plugins/system/test/entity-update.test.ts` | New — tests for update with confirmation          |
| `plugins/system/test/entity-delete.test.ts` | New — tests for delete with confirmation          |
| `plugins/system/src/tools/entity-update.ts` | New — update tool with schema validation + diff   |
| `plugins/system/src/tools/entity-delete.ts` | New — delete tool with title+preview confirmation |
| `plugins/system/src/plugin.ts`              | Register new tools                                |

## Schema Access

The tools need access to the adapter for the target entity type. The entity registry (`IShell.entityRegistry`) provides:

- `getAdapter(entityType)` → the adapter with `fromMarkdown`, `toMarkdown`, `frontmatterSchema`
- `validateEntity(entityType, entity)` → full entity validation

The update tool uses `getAdapter` to:

1. Deserialize current content
2. Validate new fields against `frontmatterSchema`
3. Serialize the updated entity back to markdown

## Verification

1. All new tests pass (`bun test plugins/system/`)
2. `bun run typecheck` / `bun run lint`
3. Via MCP: update a note's title → see diff → confirm → verify frontmatter is valid on disk
4. Via MCP: update with invalid field value → get schema error, no confirmation shown
5. Via MCP: delete a note → see title + preview → deny → verify still exists
6. Via Discord: same flows, verify confirmation prompts render correctly
