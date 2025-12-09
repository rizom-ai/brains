# Deck Generate & Publish Tools

## Status: Planning

## Overview

Add `generate` and `publish` tools to the decks plugin for consistency with the blog plugin. Also rename `presentedAt` → `publishedAt` and `presented` → `published` status for API consistency.

## Motivation

1. **Consistency** - Blog has `generate` and `publish`, decks should too
2. **AI-powered deck creation** - Allow AI to generate presentation decks from prompts
3. **Unified status model** - Use `draft`/`published` + `publishedAt` across all content types

## Changes Required

### Phase 1: Schema Rename (presentedAt → publishedAt)

Files to update:

- `plugins/decks/src/schemas/deck.ts`
  - `deckMetadataSchema`: `presentedAt` → `publishedAt`, `presented` → `published`
  - `deckSchema`: same changes
- `plugins/decks/src/formatters/deck-formatter.ts`
  - Frontmatter schema: `presentedAt` → `publishedAt`, `presented` → `published`
  - `toMarkdown()`: update field reference
  - `fromMarkdown()`: update field reference
- `plugins/decks/src/datasources/deck-datasource.ts` (if it references these fields)
- `plugins/decks/src/templates/*` (if they reference these fields)
- Any existing deck markdown files in brain-data (migration)

### Phase 2: Add Publish Tool

Create `plugins/decks/src/tools/publish.ts`:

- Input: `{ id?: string, slug?: string }`
- Action: Set `status: "published"`, `publishedAt: now()`
- Pattern: Copy from `plugins/blog/src/tools/publish.ts`

### Phase 3: Add Generate Tool & Handler

**Option A: Simple Generate (no AI)**

- Just create a deck entity from provided title/content
- No job queue needed

**Option B: AI-Powered Generate (like blog)**
Requires:

1. Generation template (`plugins/decks/src/templates/generation-template.ts`)
2. Job handler (`plugins/decks/src/handlers/deckGenerationJobHandler.ts`)
3. Generate tool (`plugins/decks/src/tools/generate.ts`)

Input schema:

```typescript
{
  prompt?: string,      // Topic/prompt for AI generation
  title?: string,       // Deck title (AI-generated if not provided)
  content?: string,     // Slide content (AI-generated if not provided)
  description?: string, // Brief description
  event?: string,       // Event name (optional)
}
```

### Phase 4: Update Plugin Registration

Update `plugins/decks/src/plugin.ts`:

- Import and register generation job handler
- Import and return tools from `getTools()`
- Register generation template

## File Structure After Changes

```
plugins/decks/src/
├── plugin.ts                    # Updated to register tools/handlers
├── schemas/
│   └── deck.ts                  # Updated: publishedAt, published
├── formatters/
│   └── deck-formatter.ts        # Updated: publishedAt, published
├── tools/
│   ├── index.ts                 # NEW: export all tools
│   ├── generate.ts              # NEW: deck_generate tool
│   └── publish.ts               # NEW: deck_publish tool
├── handlers/
│   └── deckGenerationJobHandler.ts  # NEW: job handler
├── templates/
│   ├── deck-template.ts
│   ├── deck-list/
│   └── generation-template.ts   # NEW: AI generation template
└── datasources/
    └── deck-datasource.ts
```

## Questions to Resolve

1. **AI Generation**: Should deck generation use AI (like blog) or just be a simple entity creation?
   - Blog uses AI to generate title, content, excerpt from prompt
   - Decks could use AI to generate slides from a topic/outline

2. **Event field**: Keep the `event` field separate from `publishedAt`?
   - Could be useful for decks (e.g., "presented at ReactConf 2025")
   - Blog doesn't have this concept

3. **Migration**: How to handle existing deck files with `presentedAt`?
   - Option A: Migration script to update existing files
   - Option B: Support both field names temporarily (backwards compat)
   - Option C: Just rename, no migration (breaking change for existing data)

## Implementation Order

1. [ ] Schema rename (presentedAt → publishedAt)
2. [ ] Formatter update
3. [ ] Add publish tool
4. [ ] Add generation template (AI prompt)
5. [ ] Add job handler
6. [ ] Add generate tool
7. [ ] Update plugin registration
8. [ ] Tests
