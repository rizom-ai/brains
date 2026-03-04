# Plan: Wishlist Plugin

## Context

Users make requests that the brain can't fulfill because the capability doesn't exist yet.
These requests are lost. A `wishlist` plugin captures them as entities so they form a
living wishlist/roadmap — trackable, prioritizable, and consolidated when the same wish
recurs.

## UX Decisions

- **Capture**: Tool-based. Agent calls `wishlist_add` when it hits a capability gap.
  No auto-detection heuristics (fragile, false positives).
- **Visibility**: Agent tells the user it logged the wish ("I can't do that yet, but
  I've added it to the wishlist").
- **No proactive wishes**: Only created when the agent can't fulfill a request.
- **Dedup**: Same wish requested again → increment request count + notify user
  ("This is already on the wishlist — requested 3 times").
- **Terminology**: "requested N times" (not votes/mentions).
- **Query access**: Anchor and trusted users can query the wishlist.
- **Update access**: Anchor only can change wish status.
- **Fulfillment**: Silent status update (no proactive announcements).

## Plugin Structure

```
plugins/wishlist/
├── src/
│   ├── index.ts                  # Plugin class + factory export
│   ├── config.ts                 # Config schema (minimal)
│   ├── schemas/
│   │   └── wish.ts               # Frontmatter → Metadata → Entity schemas
│   ├── adapters/
│   │   └── wish-adapter.ts       # Markdown ↔ entity conversion
│   └── tools/
│       └── index.ts              # wishlist_add, wishlist_list, wishlist_update
├── test/
│   └── tools.test.ts             # Tool behavior tests
└── package.json
```

No job handlers — wish creation is synchronous (no AI generation).
No datasource initially — tools cover the access patterns.

## Entity Schema

**Frontmatter** (stored in markdown YAML):

```typescript
const wishFrontmatterSchema = z.object({
  title: z.string(),
  status: z.enum(["new", "planned", "in-progress", "done", "declined"]),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  requested: z.number().int().default(1),
  tags: z.array(z.string()).default([]),
  declinedReason: z.string().optional(),
});
```

**Metadata** (derived via `.pick()` for DB queries):

```typescript
const wishMetadataSchema = wishFrontmatterSchema
  .pick({ title: true, status: true, priority: true, requested: true })
  .extend({
    slug: z.string(),
  });
```

**Entity**:

```typescript
const wishSchema = baseEntitySchema.extend({
  entityType: z.literal("wish"),
  metadata: wishMetadataSchema,
});
```

**Markdown body**: Description of what the user wanted and why.

## Tools

### `wishlist_add` — visibility: `"trusted"`

- **Input**: `{ title: string, description: string, priority?: Priority, tags?: string[] }`
- **Behavior**: Creates a new wish entity. Uses `slugify(title)` as entity ID.
  If a wish with the same slug already exists, increments `requested` count and
  returns `{ existed: true, requested: N }` so the agent can tell the user.
- **When to use**: Agent calls this when it identifies a capability gap.

### `wishlist_list` — visibility: `"trusted"`

- **Input**: `{ status?: Status, priority?: Priority }`
- **Behavior**: Lists wishes filtered by status/priority. Returns title, status,
  priority, requested count. Sorted by requested (descending) then priority.

### `wishlist_update` — visibility: `"anchor"`

- **Input**: `{ id: string, status?: Status, priority?: Priority, declinedReason?: string }`
- **Behavior**: Updates an existing wish's status or priority.

## Implementation Steps

### Step 1: Scaffold package

Create `plugins/wishlist/package.json` with dependencies on `@brains/plugins` and
`@brains/utils`. Add `@brains/wishlist` to the workspace.

### Step 2: Write tests first

**File**: `plugins/wishlist/test/tools.test.ts`

Using `createServicePluginHarness`:

- `wishlist_add` creates a new wish entity with `requested: 1`
- `wishlist_add` with duplicate title increments `requested` count, returns `existed: true`
- `wishlist_list` returns all wishes
- `wishlist_list` filters by status
- `wishlist_update` changes status (anchor only)
- `wishlist_update` on non-existent wish returns error

### Step 3: Implement schemas + adapter

**File**: `plugins/wishlist/src/schemas/wish.ts`

Frontmatter → Metadata → Entity schema following the `.pick()` derivation pattern.
Reference: `plugins/link/src/schemas/link.ts`

**File**: `plugins/wishlist/src/adapters/wish-adapter.ts`

Extends `BaseEntityAdapter<WishEntity, WishMetadata>`. Handles:

- `toMarkdown()` — frontmatter + description body
- `fromMarkdown()` — parse frontmatter, extract metadata, derive slug

Reference: `plugins/link/src/adapters/link-adapter.ts`

### Step 4: Implement tools

**File**: `plugins/wishlist/src/tools/index.ts`

Three tools using `createTypedTool()` with visibility options:

- `add`: visibility `"trusted"`, dedup via `entityService.getEntity("wish", slug)`
- `list`: visibility `"trusted"`
- `update`: visibility `"anchor"`

Reference: `plugins/link/src/tools/index.ts`,
`shell/plugins/src/utils/tool-helpers.ts` (line 98: `{ visibility }` option)

### Step 5: Implement plugin class

**File**: `plugins/wishlist/src/index.ts`

ServicePlugin that registers entity type, adapter, and tools in `onRegister()`.
No job handlers, no templates, no datasources.

Reference: `plugins/link/src/index.ts`

### Step 6: Register in app

**File**: `apps/professional-brain/brain.config.ts`

```typescript
import { wishlistPlugin } from "@brains/wishlist";
// ...
wishlistPlugin({}),
```

### Step 7: Verify

```bash
bun test plugins/wishlist/
bun run typecheck
bun run lint
```

## Files

| File                                            | Change                     |
| ----------------------------------------------- | -------------------------- |
| `plugins/wishlist/package.json`                 | New: package definition    |
| `plugins/wishlist/tsconfig.json`                | New: TypeScript config     |
| `plugins/wishlist/src/index.ts`                 | New: plugin class          |
| `plugins/wishlist/src/config.ts`                | New: config schema         |
| `plugins/wishlist/src/schemas/wish.ts`          | New: entity schemas        |
| `plugins/wishlist/src/adapters/wish-adapter.ts` | New: markdown adapter      |
| `plugins/wishlist/src/tools/index.ts`           | New: add/list/update tools |
| `plugins/wishlist/test/tools.test.ts`           | New: tool tests            |
| `apps/professional-brain/brain.config.ts`       | Register wishlist plugin   |

## Key Design Decisions

- **Tool-based capture** — agent explicitly logs wishes, no heuristic auto-detection
- **Dedup by slug** — same title = increment `requested` count, not duplicate entity
- **Tiered visibility** — add: trusted, list: trusted, update: anchor
- **No job handlers** — wish creation is synchronous, no AI needed
- **Slug-based IDs** — deterministic from title, enables dedup via `getEntity()`
- **`.pick()` metadata derivation** — keeps frontmatter and metadata in sync
- **Declined status with reason** — wishes can be explicitly declined with an explanation

## Verification

```bash
bun test plugins/wishlist/
bun run typecheck
bun run lint
```
