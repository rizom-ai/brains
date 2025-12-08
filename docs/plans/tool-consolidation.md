# Tool Consolidation Plan

## Status: In Progress

## Overview

Consolidate plugin-specific list/get/search tools into enhanced system tools to reduce tool count and improve agent performance.

**Goal**: ~37 tools → ~22 tools (40% reduction)

## Motivation

1. **Fewer tools = better agent performance** - The agent chooses from fewer options, reducing confusion and token usage
2. **Consistent API** - Users and agents learn one pattern (`system_search`, `system_get`, `system_list`) instead of memorizing `blog_list`, `decks_list`, `link_list`, etc.
3. **Less code to maintain** - Each plugin doesn't need its own list/get boilerplate

## Principle

**System tools for CRUD, plugin tools for domain actions.**

## Tools to Remove

| Plugin      | Tools to Remove                              | Replacement                                  |
| ----------- | -------------------------------------------- | -------------------------------------------- |
| **system**  | `system_query`                               | None (redundant - AI calling AI)             |
| **blog**    | `blog_list`, `blog_get`                      | `system_list`, `system_get`                  |
| **decks**   | `decks_list`, `decks_get`                    | `system_list`, `system_get`                  |
| **link**    | `link_list`, `link_search`, `link_get`       | `system_list`, `system_search`, `system_get` |
| **topics**  | `topics_list`, `topics_get`, `topics_search` | `system_list`, `system_get`, `system_search` |
| **summary** | `summary_list`, `summary_get`                | `system_list`, `system_get`                  |

## Tools to Keep (Domain-Specific Actions)

| Plugin             | Tools                                                                                                                                      | Reason                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| **system**         | `search`, `get`, `check-job-status`, `get-conversation`, `list-conversations`, `get-messages`, `get-identity`, `get-profile`, `get-status` | Core system operations       |
| **blog**           | `generate`, `publish`, `generate-rss`                                                                                                      | Content creation actions     |
| **link**           | `capture`                                                                                                                                  | URL capture action           |
| **topics**         | `extract`, `merge`                                                                                                                         | AI extraction + merge action |
| **summary**        | `export`, `delete`, `stats`                                                                                                                | Export/delete/stats actions  |
| **site-builder**   | `generate`, `build-site`, `list_routes`, `list_templates`                                                                                  | Site-specific actions        |
| **directory-sync** | `sync`                                                                                                                                     | Filesystem sync action       |
| **git-sync**       | `sync`, `status`                                                                                                                           | Git operations               |

## System Tool Enhancements

### 1. `system_search` (enhance existing)

**Current**:

- `entityType` required
- No metadata filtering

**Enhanced**:

```typescript
inputSchema: {
  entityType: z.string().optional(), // Make optional - search all types
  query: z.string(),
  filter: z.record(z.unknown()).optional(), // Metadata filter
  limit: z.number().optional(),
}
```

### 2. `system_get` (enhance existing)

**Current**:

- Lookup by ID only
- Truncates content to 200 chars
- Returns generic entity fields

**Enhanced**:

```typescript
inputSchema: {
  entityType: z.string(),
  id: z.string(), // Can be ID, slug, or title
}

// Changes:
// - Support lookup by slug/title (not just ID)
// - Return full content (no truncation)
// - Return full metadata for entity type
```

### 3. `system_list` (new tool)

**Purpose**: Simple entity listing without semantic search

```typescript
{
  name: "system_list",
  description: "List entities by type with optional filters",
  inputSchema: {
    entityType: z.string(),
    filter: z.object({
      status: z.string().optional(), // draft, published, etc.
      // Other metadata filters
    }).optional(),
    limit: z.number().optional().default(20),
    sortBy: z.enum(["created", "updated"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
  }
}
```

## Implementation Order

1. **Phase 1: Enhance system tools**
   - [ ] Remove `system_query` (redundant)
   - [ ] Enhance `system_search` (optional entityType, add filter)
   - [ ] Enhance `system_get` (remove truncation, slug/title lookup)
   - [ ] Add `system_list` (new tool)

2. **Phase 2: Remove plugin-specific CRUD tools**
   - [ ] Remove `blog_list`, `blog_get`
   - [ ] Remove `decks_list`, `decks_get`
   - [ ] Remove `link_list`, `link_search`, `link_get`
   - [ ] Remove `topics_list`, `topics_get`, `topics_search`
   - [ ] Remove `summary_list`, `summary_get`

3. **Phase 3: Update tests**
   - [ ] Update system plugin tests
   - [ ] Update affected plugin tests
   - [ ] Verify agent can still perform all operations

## Migration Notes

- Entity-specific metadata (like blog post series info, deck events) will be available through the generic `system_get` response
- Plugins can still define their own schemas for entities; system tools just need to return the full entity data
- Agent prompts/instructions may need updates to guide it toward using system tools

## Risks

- Agent may need retraining/prompt updates to use new tool names
- Some plugin-specific formatting in responses will be lost (mitigated by returning full data)
