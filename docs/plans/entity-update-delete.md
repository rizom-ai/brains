# Plan: Entity Update & Delete Tools

## Context

The entity service supports full CRUD (`createEntity`, `updateEntity`, `deleteEntity`) but the tool layer only exposes create and generate. Users can't edit or remove content through conversation or MCP. This is a gap for all brains, especially minimal preset users who only have Discord/A2A.

## Approach

Add generic `entity_update` and `entity_delete` tools to the **system plugin**. These work on any entity type, including published content. Destructive operations require explicit user confirmation before executing — the confirmation IS the safety net.

## Tools

### `entity_update`

- **Input**: `entityType`, `id`, and either `content` (full markdown replacement) or `fields` (partial frontmatter update)
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
  - update with full content replacement → confirmation shown with diff → confirm → entity updated
  - update with partial frontmatter fields → confirmation shown with diff → confirm → fields updated
  - update published entity → confirmation shown with diff → confirm → entity updated (no unpublish)
  - update → deny → entity unchanged
  - update nonexistent entity → error
- `plugins/system/test/entity-delete.test.ts`
  - delete → confirmation shown with title + preview → confirm → entity deleted
  - delete published entity → confirmation shown with title + preview → confirm → entity deleted
  - delete → deny → entity still exists
  - delete nonexistent entity → error

### Step 2: Implement tools

- `plugins/system/src/tools/entity-update.ts` — generates diff for confirmation, applies on confirm
- `plugins/system/src/tools/entity-delete.ts` — fetches title + preview for confirmation, deletes on confirm

### Step 3: Register tools

- `plugins/system/src/plugin.ts` — add new tools to `getTools()`

## Key Files

| File                                        | Change                                            |
| ------------------------------------------- | ------------------------------------------------- |
| `plugins/system/test/entity-update.test.ts` | New — tests for update with confirmation          |
| `plugins/system/test/entity-delete.test.ts` | New — tests for delete with confirmation          |
| `plugins/system/src/tools/entity-update.ts` | New — update tool with diff confirmation          |
| `plugins/system/src/tools/entity-delete.ts` | New — delete tool with title+preview confirmation |
| `plugins/system/src/plugin.ts`              | Register new tools                                |

## Verification

1. All new tests pass (`bun test plugins/system/`)
2. `bun run typecheck` / `bun run lint`
3. Via MCP: update a note → see diff → confirm → verify change on disk
4. Via MCP: delete a note → see title + preview → deny → verify still exists
5. Via Discord: same flows, verify confirmation prompts render correctly
