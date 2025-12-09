# Tool Consolidation Plan

## Status: Complete ✅

## Overview

Consolidate plugin-specific list/get/search tools into enhanced system tools to reduce tool count and improve agent performance.

**Result**: ~37 tools → ~20 tools (~46% reduction)

## Motivation

1. **Fewer tools = better agent performance** - The agent chooses from fewer options, reducing confusion and token usage
2. **Consistent API** - Users and agents learn one pattern (`system_search`, `system_get`, `system_list`) instead of memorizing `blog_list`, `decks_list`, `link_list`, etc.
3. **Less code to maintain** - Each plugin doesn't need its own list/get boilerplate

## Principle

**System tools for CRUD, plugin tools for domain actions.**

## Tools Removed

| Plugin      | Tools Removed                                                       | Replacement                                           |
| ----------- | ------------------------------------------------------------------- | ----------------------------------------------------- |
| **system**  | `system_query`                                                      | None (redundant - AI calling AI)                      |
| **blog**    | `blog_list`, `blog_get`                                             | `system_list`, `system_get`                           |
| **decks**   | `decks_list`, `decks_get`                                           | `system_list`, `system_get`                           |
| **link**    | `link_list`, `link_search`, `link_get`                              | `system_list`, `system_search`, `system_get`          |
| **topics**  | `topics_list`, `topics_get`, `topics_search`                        | `system_list`, `system_get`, `system_search`          |
| **summary** | `summary_list`, `summary_export`, `summary_delete`, `summary_stats` | `system_list`, `system_get` (AI can format/calculate) |

## Remaining Tools (Domain-Specific Actions)

| Plugin             | Tools                                                                                                                                              | Reason                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **system**         | `search`, `get`, `list`, `check-job-status`, `get-conversation`, `list-conversations`, `get-messages`, `get-identity`, `get-profile`, `get-status` | Core system operations       |
| **blog**           | `generate`, `publish`, `generate-rss`                                                                                                              | Content creation actions     |
| **decks**          | (none)                                                                                                                                             | All CRUD via system tools    |
| **link**           | `capture`                                                                                                                                          | URL capture action           |
| **topics**         | `extract`, `merge`                                                                                                                                 | AI extraction + merge action |
| **summary**        | `get` (by conversationId)                                                                                                                          | Domain-specific lookup       |
| **site-builder**   | `generate`, `build-site`, `list_routes`, `list_templates`                                                                                          | Site-specific actions        |
| **directory-sync** | `sync`                                                                                                                                             | Filesystem sync action       |
| **git-sync**       | `sync`, `status`                                                                                                                                   | Git operations               |

## System Tool Enhancements (Implemented)

### 1. `system_search` (enhanced)

- `entityType` now optional - searches all types when omitted
- Empty types array searches all entity types

### 2. `system_get` (enhanced)

- Supports lookup by ID, slug, or title (tries each in order)
- Returns full content (no truncation)
- Parses frontmatter and merges with metadata
- Shows full body after `---` separator

### 3. `system_list` (new)

- Lists entities by type with optional filters
- Supports `status` filter for metadata filtering
- Returns formatted list with titles and subtitles

## Implementation Phases (Complete)

### Phase 1: Enhance system tools ✅

- [x] Remove `system_query` (redundant)
- [x] Enhance `system_search` (optional entityType)
- [x] Enhance `system_get` (remove truncation, slug/title lookup)
- [x] Add `system_list` (new tool)

### Phase 2: Remove plugin-specific CRUD tools ✅

- [x] Remove `blog_list`, `blog_get`
- [x] Remove `decks_list`, `decks_get`
- [x] Remove `link_list`, `link_search`, `link_get`
- [x] Remove `topics_list`, `topics_get`, `topics_search`
- [x] Remove `summary_list`, `summary_export`, `summary_delete`, `summary_stats`

### Phase 3: Update tests ✅

- [x] Update system plugin tests
- [x] Update affected plugin tests
- [x] All tests passing (1283 tests)

## Commits

1. `25e4424f` - feat(system): enhance system tools for tool consolidation (Phase 1)
2. `cc3072b5` - refactor: remove plugin-specific list/get/search tools (Phase 2)

## Migration Notes

- Entity-specific metadata (like blog post series info, deck events) is available through the generic `system_get` response
- `summary_get` kept because it uses `conversationId` (domain-specific), not entity ID
- Agent prompts/instructions may need updates to guide it toward using system tools
