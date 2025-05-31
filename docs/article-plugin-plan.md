# Article Plugin Planning Document

## Overview

The Article plugin adds support for long-form, structured content to the Personal Brain. Articles are separate from Notes and designed for published content like blog posts, tutorials, and documentation.

## Core Decisions

Based on requirements gathering, the Article plugin will:

### Entity Design
- **Separate entity type** - Articles are distinct from Notes, not a subtype
- **Draft/Published workflow** - Using `publishedAt` field (null = draft)
- **No categories** - Use tags for categorization (simpler, more flexible)
- **Series support** - Via frontmatter fields (`series` and `seriesPart`)

### Fields to Include
- `title` - Article title (required)
- `content` - Markdown content (required)
- `tags` - Array of tags (same as other entities)
- `publishedAt` - ISO timestamp when published (null for drafts)
- `series` - Name of series (optional)
- `seriesPart` - Number in series (optional)
- Standard fields: `id`, `entityType`, `created`, `updated`

### Fields Explicitly Excluded (Presentation Concerns)
- ❌ Table of contents - Generate at presentation time
- ❌ Reading time - Calculate on demand
- ❌ Author - Implicit in personal brain
- ❌ Slug - Generate from title/ID at presentation
- ❌ Excerpt - Auto-generate, override in Git if needed
- ❌ SEO metadata - Can be generated or added later

### Technical Implementation

#### Schema Definition
```typescript
const articleSchema = baseEntitySchema.extend({
  entityType: z.literal("article"),
  publishedAt: z.string().datetime().nullable().default(null),
  series: z.string().optional(),
  seriesPart: z.number().int().positive().optional(),
});
```

#### Article Adapter
- Extends `EntityAdapter<Article>`
- Handles frontmatter serialization for series fields
- Preserves publishedAt in frontmatter

#### MCP Tools
1. `create_article` - Create new article (draft by default)
2. `update_article` - Update existing article
3. `publish_article` - Set publishedAt timestamp
4. `unpublish_article` - Set publishedAt to null
5. `delete_article` - Remove article
6. `get_article` - Get single article by ID
7. `list_articles` - List articles with filters:
   - `includeDrafts` - Include drafts in results (default: false)
   - `series` - Filter by series name
   - `tags` - Filter by tags
8. `search_articles` - Full-text search published articles

#### Query Behavior
- Default queries exclude drafts (publishedAt = null)
- Explicit flag needed to include drafts
- Series articles can be queried together
- Standard tag-based filtering applies

## Package Structure

```
packages/article-plugin/
├── src/
│   ├── index.ts           # Plugin definition and registration
│   ├── schema.ts          # Article schema definition
│   ├── adapter.ts         # ArticleAdapter for markdown conversion
│   ├── tools.ts           # MCP tool definitions
│   └── factory.ts         # createArticle helper function
├── test/
│   ├── schema.test.ts
│   ├── adapter.test.ts
│   └── tools.test.ts
├── package.json
├── tsconfig.json
└── README.md
```

## Example Usage

### Creating an Article
```typescript
const article = createArticle({
  title: "Getting Started with TypeScript",
  content: "TypeScript is a typed superset of JavaScript...",
  tags: ["tutorial", "typescript", "programming"],
  series: "TypeScript Fundamentals",
  seriesPart: 1
});
```

### Markdown Storage Format
```markdown
---
id: "abc123"
entityType: "article"
title: "Getting Started with TypeScript"
tags: ["tutorial", "typescript", "programming"]
created: "2024-01-15T10:00:00Z"
updated: "2024-01-15T10:00:00Z"
publishedAt: "2024-01-15T12:00:00Z"
series: "TypeScript Fundamentals"
seriesPart: 1
---

# Getting Started with TypeScript

TypeScript is a typed superset of JavaScript...
```

## Git Sync Behavior

Articles follow standard Git sync patterns:
- Stored in `article/` directory
- Drafts and published articles both synced
- Filename: `{title-slugified}.md`
- Series organization through frontmatter, not directories

## Future Enhancements (Not in V1)

- Custom SEO metadata fields
- Canonical URL for external content
- Article templates
- Scheduled publishing
- Version history/revisions
- Co-author support
- Content blocks/sections

## Success Criteria

1. ✓ Can create, update, delete articles
2. ✓ Draft/published workflow works correctly
3. ✓ Series articles can be grouped and ordered
4. ✓ Search excludes drafts by default
5. ✓ Git sync preserves all article metadata
6. ✓ Integration with existing search/embedding system
7. ✓ Clean separation from Note entity type