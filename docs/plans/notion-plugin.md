# Plan: Notion Plugin (Read-Only Knowledge Source)

## Context

Rover needs access to Notion workspace content as conversational context. The plugin syncs the full workspace (pages, databases, comments) into a local cache and exposes it as MCP resources and search tools. Read-only — no entity creation, no writes to Notion.

## Architecture

```
Notion API → sync daemon → local markdown cache → MCP resources + tools
```

**Plugin type**: CorePlugin (read-only, no entity writes)

### Sync flow

1. Daemon runs on interval (default 5 minutes)
2. Fetches workspace tree via Notion API (`search`, `blocks.children`)
3. Converts Notion blocks to markdown (headings, lists, code, tables, etc.)
4. Stores in in-memory cache with file backup for persistence
5. Incremental: uses `last_edited_time` to skip unchanged pages

### Tools

| Tool            | Description                                        | Permission |
| --------------- | -------------------------------------------------- | ---------- |
| `notion_search` | Full-text search across pages and database entries | public     |
| `notion_read`   | Read a specific page by ID or title as markdown    | public     |
| `notion_list`   | List top-level pages or entries in a database      | public     |

### MCP Resources

| Resource                 | Description                                  |
| ------------------------ | -------------------------------------------- |
| `notion://pages`         | List of all synced pages with titles and IDs |
| `notion://page/{id}`     | Page content as markdown                     |
| `notion://databases`     | List of databases with field schemas         |
| `notion://database/{id}` | Database entries as structured data          |

### Config

```yaml
plugins:
  notion:
    token: ${NOTION_TOKEN}
    syncInterval: 300
    workspaceFilter: [] # Optional: limit to specific page/database IDs
```

## Implementation

### Files

```
plugins/notion/
  package.json
  src/
    index.ts                   # Plugin export
    plugin.ts                  # CorePlugin — registers tools, resources, daemon
    config.ts                  # Zod config schema
    notion-client.ts           # Notion API wrapper (constructor DI for fetch)
    block-to-markdown.ts       # Convert Notion block tree to markdown string
    sync.ts                    # Sync orchestration: fetch → convert → cache
    cache.ts                   # NotionCache: in-memory Map + file persistence
    tools/
      notion-search.ts         # Search tool
      notion-read.ts           # Read page tool
      notion-list.ts           # List pages/databases tool
    resources/
      notion-resources.ts      # MCP resource handlers
  test/
    block-to-markdown.test.ts  # Block conversion (pure, no API)
    sync.test.ts               # Sync with mock Notion client
    cache.test.ts              # Cache read/write/TTL
    tools.test.ts              # Tool handlers with mock cache
```

### Dependencies

- `@notionhq/client` — official Notion SDK (or raw fetch for lighter weight)
- No other new deps — uses existing `@brains/plugins` framework

### Notion API Client

Constructor DI pattern (same as Discord):

```typescript
interface NotionDeps {
  fetch?: typeof globalThis.fetch;
  token: string;
}

class NotionClient {
  constructor(private deps: NotionDeps) {}

  async searchPages(query: string): Promise<NotionPage[]> { ... }
  async getPage(id: string): Promise<NotionPage> { ... }
  async getBlockChildren(id: string): Promise<NotionBlock[]> { ... }
  async getDatabase(id: string): Promise<NotionDatabase> { ... }
  async queryDatabase(id: string, filter?: object): Promise<NotionEntry[]> { ... }
}
```

### Block-to-Markdown Conversion

Recursive converter handling:

- Paragraphs, headings (h1-h3), bulleted/numbered lists
- Code blocks (with language), quotes, callouts
- Tables, toggles, dividers
- Rich text: bold, italic, code, links, mentions
- Child pages (as links), synced blocks
- Database entries: frontmatter-style key/value pairs
- Comments: appended as blockquotes below page content

### Cache

```typescript
interface CachedPage {
  id: string;
  title: string;
  markdown: string;
  parentId: string | null;
  type: "page" | "database" | "database_entry";
  lastEdited: string;
  syncedAt: number;
}

class NotionCache {
  private pages: Map<string, CachedPage>;
  private cacheFile: string;

  search(query: string): CachedPage[]; // simple substring match on title + markdown
  get(id: string): CachedPage | undefined;
  list(type?: string): CachedPage[];
  set(page: CachedPage): void;
  persist(): Promise<void>; // write to disk
  restore(): Promise<void>; // read from disk on startup
}
```

### Daemon

```typescript
// In plugin.ts
protected override createDaemon(): Daemon {
  return {
    start: async () => {
      await this.cache.restore();
      await this.sync.fullSync();          // initial
      this.interval = setInterval(
        () => this.sync.incrementalSync(),
        this.config.syncInterval * 1000,
      );
    },
    stop: async () => {
      clearInterval(this.interval);
      await this.cache.persist();
    },
  };
}
```

## Phases

### Phase 1: Core sync + cache

- NotionClient with constructor DI
- Block-to-markdown converter
- NotionCache with file persistence
- Sync daemon (full + incremental)
- Tests for converter and cache

### Phase 2: Tools

- `notion_search`, `notion_read`, `notion_list`
- Tests with mock cache

### Phase 3: MCP Resources

- Resource handlers for pages, databases
- Resource templates for `notion://page/{id}`

### Phase 4: Register in Rover

- Add to rover brain definition (optional plugin)
- Add `NOTION_TOKEN` to brain.yaml config

## Verification

1. `bun test plugins/notion/` — all tests pass
2. `bun run typecheck --filter=@brains/notion`
3. Manual: start rover with notion config, verify `notion_search` returns results
4. Manual: check MCP resources via MCP Inspector
