# @brains/blog

AI-powered blog plugin for Personal Brain applications.

## Overview

This plugin provides comprehensive blog functionality including AI-assisted content generation, publishing workflows, and automatic site integration. Blog posts are stored as markdown files with frontmatter, making them human-readable and version-control friendly.

## Features

- **AI Content Generation**: Generate blog posts from prompts or existing knowledge
- **Publishing Workflow**: Draft → Publish lifecycle with timestamps
- **Series Support**: Organize posts into multi-part series
- **Site Builder Integration**: Automatic route and template generation
- **Smart Navigation**: Automatic prev/next post linking
- **SEO Ready**: Frontmatter metadata for titles, excerpts, and cover images
- **Author Attribution**: Automatic author extraction from profile

## Installation

```bash
bun add @brains/blog
```

## Usage

### Basic Setup

```typescript
import { blogPlugin } from "@brains/blog";

const config = defineConfig({
  plugins: [
    blogPlugin({
      defaultPrompt: "Write an insightful blog post about recent work",
    }),
  ],
});
```

### Generate a Blog Post

Use the `blog:generate` tool to create new posts:

```typescript
// AI generates everything from a prompt
await brain.executeTool("blog:generate", {
  prompt: "Write about TypeScript best practices",
});

// Provide your own content
await brain.executeTool("blog:generate", {
  title: "My First Post",
  content: "# Introduction\n\nThis is my first blog post...",
  excerpt: "A brief introduction to my blog",
});

// Create a series post
await brain.executeTool("blog:generate", {
  title: "TypeScript Basics - Part 1",
  content: "...",
  seriesName: "TypeScript Tutorial",
  seriesIndex: 1,
});
```

### Publish a Post

Use the `blog:publish` tool to publish drafts:

```typescript
await brain.executeTool("blog:publish", {
  id: "my-first-post", // The post slug
});
```

Publishing automatically:

- Sets `status` to `"published"`
- Records `publishedAt` timestamp
- Triggers site rebuild
- Updates post navigation

## Configuration

```typescript
interface BlogConfig {
  defaultPrompt?: string; // Default AI generation prompt
}
```

## Blog Post Schema

Blog posts are stored as entities with the following structure:

### Entity Fields

```typescript
interface BlogPost extends BaseEntity {
  id: string; // Slug (human-readable URL)
  entityType: "post";
  content: string; // Markdown with frontmatter
  metadata: {
    title: string;
    status: "draft" | "published";
    publishedAt?: string; // ISO 8601 timestamp
    seriesName?: string;
    seriesIndex?: number;
  };
}
```

### Frontmatter Schema

```yaml
---
title: Post Title
status: draft
excerpt: A brief summary of the post
author: Author Name
publishedAt: "2025-01-01T10:00:00.000Z" # Only for published posts
coverImage: https://example.com/image.jpg # Optional
seriesName: My Series # Optional
seriesIndex: 1 # Optional
---
# Post Content

Your markdown content here...
```

## Tools

### `blog:generate`

Queue a job to create a new blog post draft.

**Input Schema:**

```typescript
{
  prompt?: string;        // AI generation prompt (optional)
  title?: string;         // Post title (AI generated if not provided)
  content?: string;       // Post content (AI generated if not provided)
  excerpt?: string;       // Summary (AI generated if not provided)
  coverImage?: string;    // Cover image URL
  seriesName?: string;    // Series name
  seriesIndex?: number;   // Position in series (auto-incremented if not provided)
}
```

**Behavior:**

- If `title` and `content` are missing, AI generates everything
- If `title` and `content` are provided but `excerpt` is missing, AI generates only the excerpt
- If all fields are provided, no AI generation occurs
- Posts are created as drafts by default
- Slug is auto-generated from title

**Example:**

```bash
# Via MCP/CLI
blog:generate prompt="Write about microservices architecture"
```

### `blog:publish`

Publish a blog post (or re-publish to update timestamp).

**Input Schema:**

```typescript
{
  id: string; // Post slug/ID
}
```

**Behavior:**

- Sets `status` to `"published"`
- Records `publishedAt` timestamp (or updates it for re-publishing)
- Updates frontmatter in markdown content
- Triggers `entity:updated` message for site rebuild

**Example:**

```bash
# Via MCP/CLI
blog:publish id="microservices-architecture"
```

## Site Builder Integration

The blog plugin automatically registers with the site builder:

### Routes

Blog posts are automatically available at:

- `/posts` - List of all posts
- `/posts/:slug` - Individual post detail page
- `/posts/series/:seriesName` - Series list page

### Templates

Three templates are provided:

1. **`blog:post-list`** - Blog list page
2. **`blog:post-detail`** - Individual post with navigation
3. **`blog:post-series`** - Series list page

### Data Source

The `blog:entities` data source provides:

- Latest post queries
- Single post by ID with prev/next navigation
- Series post filtering
- Automatic frontmatter parsing

## Examples

### Professional Blog Setup

```typescript
// brain.config.ts
import { defineConfig } from "@brains/app";
import { blogPlugin } from "@brains/blog";
import { siteBuilderPlugin } from "@brains/site-builder-plugin";

const routes = [
  {
    id: "home",
    path: "/",
    title: "Home",
    sections: [
      {
        id: "latest-post",
        template: "blog:post-detail",
        dataQuery: {
          entityType: "post",
          query: { latest: true },
        },
      },
    ],
  },
  {
    id: "blog",
    path: "/posts",
    title: "Blog",
    sections: [
      {
        id: "post-list",
        template: "blog:post-list",
        dataQuery: { entityType: "post" },
      },
    ],
  },
];

export default defineConfig({
  plugins: [
    blogPlugin({
      defaultPrompt: "Write about my recent work and insights",
    }),
    siteBuilderPlugin({ routes }),
  ],
});
```

### Creating a Blog Post Programmatically

```typescript
import { blogPostAdapter } from "@brains/blog";

// Manual entity creation (bypassing AI)
const postContent = blogPostAdapter.createPostContent(
  {
    title: "Hello World",
    status: "draft",
    excerpt: "My first post",
    author: "John Doe",
  },
  "# Hello World\n\nThis is my first blog post!",
);

await entityService.createEntity({
  id: "hello-world",
  entityType: "post",
  content: postContent,
  metadata: {
    title: "Hello World",
    status: "draft",
  },
});
```

### Querying Blog Posts

```typescript
// Get all published posts
const posts = await entityService.listEntities("post");
const published = posts.filter((p) => p.metadata.status === "published");

// Get posts in a series
const seriesPosts = posts
  .filter((p) => p.metadata.seriesName === "TypeScript Tutorial")
  .sort(
    (a, b) => (a.metadata.seriesIndex ?? 0) - (b.metadata.seriesIndex ?? 0),
  );
```

## Architecture

### Components

1. **BlogPostAdapter** - Entity ↔ Markdown conversion with frontmatter
2. **BlogDataSource** - Fetch blog data for site rendering
3. **BlogGenerationJobHandler** - AI-powered content generation
4. **Tools** - `blog:generate` and `blog:publish`
5. **Templates** - Preact components for rendering

### Workflow

```
User Request
    ↓
blog:generate tool
    ↓
Job Queue → BlogGenerationJobHandler
    ↓
AI Service (optional)
    ↓
Profile Service (for author)
    ↓
Entity Service (create draft)
    ↓
Directory Sync (write to filesystem)
```

```
User Request
    ↓
blog:publish tool
    ↓
Entity Service (update entity)
    ↓
Message Bus (entity:updated)
    ↓
Site Builder (rebuild site)
    ↓
Preview Server (updated site)
```

## Testing

The blog plugin includes comprehensive test coverage:

- **90 tests** across 5 test files
- **247 expect() calls**
- Unit tests for all components

Run tests:

```bash
bun test
```

## Dependencies

- `@brains/plugins` - Core plugin system
- `@brains/entity-service` - Entity storage
- `@brains/profile-service` - Author attribution
- `@brains/site-builder-plugin` - Site integration
- `@brains/templates` - Template system
- `@brains/utils` - Utilities (Zod, markdown, etc.)

## License

MIT

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for contribution guidelines.
