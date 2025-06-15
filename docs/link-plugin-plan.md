# Link Plugin Planning Document

## Overview

The Link plugin adds support for capturing, summarizing, and organizing web content. When given a URL, it fetches the content, generates a summary using AI, extracts tags, and stores it as a link entity for future reference.

## Core Decisions

### Entity Design

- **Separate entity type** - Links are distinct from other content types
- **Read/Unread tracking** - Using `readAt` field (null = unread)
- **No archive feature** - Simplifying the workflow, users can delete old links
- **Auto-tagging** - AI extracts relevant tags from content
- **Domain tracking** - Store domain for filtering by source

### Fields to Include

- `url` - The web URL (required)
- `title` - Page title or AI-generated title (required)
- `description` - AI-generated summary of the content (optional)
- `domain` - Extracted domain name for filtering (required)
- `savedAt` - ISO timestamp when link was saved (required)
- `readAt` - ISO timestamp when marked as read (null for unread)
- `tags` - Array of AI-extracted tags (same as other entities)
- Standard fields: `id`, `entityType`, `created`, `updated`, `content`

### Technical Implementation

#### Schema Definition

```typescript
const linkSchema = baseEntitySchema.extend({
  entityType: z.literal("link"),
  url: z.string().url(),
  title: z.string(),
  description: z.string().optional(),
  domain: z.string(),
  savedAt: z.string().datetime(),
  readAt: z.string().datetime().nullable().default(null),
});
```

#### Link Adapter

- Extends `EntityAdapter<Link>`
- Handles frontmatter serialization for link metadata
- Stores full content in body for searchability

#### MCP Tools

1. `save_link` - Fetch URL content, generate summary, extract tags, and save
   - Parameters:
     - `url` - The URL to save
     - `customTitle` - Optional custom title (overrides extracted)
     - `customTags` - Optional additional tags
2. `get_link` - Get single link by ID
3. `list_links` - List links with filters:
   - `unread` - Show only unread links (default: false)
   - `domain` - Filter by domain
   - `tags` - Filter by tags
   - `limit` - Maximum results
   - `sortBy` - Sort by savedAt or readAt
4. `search_links` - Full-text search saved links
5. `mark_link_read` - Set readAt timestamp
6. `delete_link` - Remove link

#### Query Behavior

- Default queries include both read and unread links
- Can filter to show only unread links
- Support domain-based filtering (e.g., all GitHub links)
- Standard tag-based filtering applies

## Package Structure

```
packages/link-plugin/
├── src/
│   ├── index.ts           # Plugin definition and registration
│   ├── schema.ts          # Link schema definition
│   ├── adapter.ts         # LinkAdapter for markdown conversion
│   ├── tools.ts           # MCP tool definitions
│   ├── link-service.ts    # Business logic for link operations
│   └── factory.ts         # createLink helper function
├── test/
│   ├── schema.test.ts
│   ├── adapter.test.ts
│   ├── tools.test.ts
│   └── link-service.test.ts
├── package.json
├── tsconfig.json
└── README.md
```

## Implementation Details

### Content Fetching
- Use the shell's WebFetch tool to retrieve page content
- Extract title from HTML if available
- Convert HTML to markdown for storage

### AI Processing
- Use QueryProcessor to generate summary
- Extract relevant tags based on content
- Prompt template:
  ```
  Summarize this web page content in 2-3 sentences.
  Also suggest 3-5 relevant tags for categorization.
  
  URL: {url}
  Content: {content}
  ```

### Storage Format
```markdown
---
url: https://example.com/article
title: Example Article Title
description: AI-generated summary of the article content
domain: example.com
savedAt: 2024-01-15T10:30:00Z
readAt: null
tags: [web-development, javascript, tutorial]
---

# Example Article Title

[Full markdown content of the article for searchability]
```

## Example Usage

### Saving a Link
```typescript
// Save a new link
await linkPlugin.tools.save_link({
  url: "https://example.com/interesting-article"
});

// Save with custom title and tags
await linkPlugin.tools.save_link({
  url: "https://example.com/interesting-article",
  customTitle: "Must Read: AI Development",
  customTags: ["important", "ai"]
});
```

### Querying Links
```typescript
// List unread links
const unreadLinks = await linkPlugin.tools.list_links({
  unread: true
});

// Search for specific content
const aiLinks = await linkPlugin.tools.search_links({
  query: "machine learning"
});

// Get links from specific domain
const githubLinks = await linkPlugin.tools.list_links({
  domain: "github.com"
});
```

### Managing Read Status
```typescript
// Mark link as read
await linkPlugin.tools.mark_link_read({
  linkId: "link-123"
});
```

## Future Enhancements

1. **Automatic tagging improvements** - Better tag extraction using content analysis
2. **Duplicate detection** - Warn when saving an already-saved URL
3. **Content refresh** - Update saved content if page changes
4. **Export functionality** - Export links to various formats
5. **Browser extension** - Quick save from browser
6. **Reading time estimation** - Calculate based on content length