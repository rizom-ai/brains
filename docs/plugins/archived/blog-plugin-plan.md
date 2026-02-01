# Blog Plugin Planning Document

## Overview

The Blog plugin provides AI-powered blog post generation from existing brain content, with draft/publish workflow and series organization. Posts are stored as entities (entityType="blog") leveraging the existing entity system.

## Core Philosophy

- Blog posts are markdown files with specific frontmatter (entity system)
- AI generates content by querying existing brain knowledge
- Leverage existing entity CRUD operations
- Series support for organizing related posts
- Build-time filtering for draft vs published posts

## Entity Schema

```typescript
export const blogPostSchema = z.object({
  // BaseEntity fields inherited
  id: z.string(),
  entityType: z.literal("blog"),
  content: z.string(), // AI-generated markdown content
  metadata: z.object({
    title: z.string(), // AI-generated
    slug: z.string(), // Auto-generated from title
    status: z.enum(["draft", "published"]).default("draft"),
    publishedAt: z.string().datetime().optional(),
    excerpt: z.string(), // AI-generated from content
    author: z.string(), // From profile entity
    coverImage: z.string().optional(), // Image URL (HackMD CDN, external, etc.)
    seriesName: z.string().optional(), // Series name
    seriesIndex: z.number().optional(), // Position in series
  }),
  embedding: z.array(z.number()).optional(),
  createdAt: z.string().datetime(),
  source: z.string(),
});
```

## Plugin Structure

```
plugins/blog/
├── package.json
├── src/
│   ├── index.ts
│   ├── plugin.ts
│   ├── config.ts
│   ├── schemas/
│   │   └── blog-post.ts
│   ├── adapters/
│   │   └── blog-post-adapter.ts
│   ├── tools/
│   │   ├── generate.ts
│   │   └── publish.ts
│   └── templates/
│       ├── blog-list.tsx
│       ├── blog-post.tsx
│       └── series-list.tsx
└── test/
    └── plugin.test.ts
```

## Configuration

```typescript
export const blogConfigSchema = z.object({
  defaultPrompt: z
    .string()
    .default("Write a blog post about my recent work and insights"),
});
```

## Core Tools

### blog:generate

**Description**: AI-powered blog post generation from existing brain content

**Input Schema**:

```typescript
{
  prompt: z.string().optional().default(config.defaultPrompt),
  coverImage: z.string().optional(),
  seriesName: z.string().optional(),
  seriesIndex: z.number().optional(),
}
```

**Process**:

1. Use AI to query brain for content relevant to prompt
2. AI generates: title, content (markdown), excerpt
3. Auto-generate slug from title (lowercase, replace spaces/special chars with hyphens)
4. Get author from profile entity
5. Handle series:
   - If seriesName provided but no seriesIndex: Query existing posts in series, sort by publishedAt, assign next sequential number
   - If both provided: Use explicit values
   - If neither: No series metadata
6. Create blog entity with status='draft'

**Output**: Created blog entity

### blog:publish

**Description**: Publish a draft blog post (sets publishedAt, triggers production rebuild)

**Input Schema**:

```typescript
{
  id: z.string().describe("Blog post ID"),
}
```

**Process**:

1. Get blog post entity
2. Set `publishedAt` to current ISO timestamp
3. Trigger production site rebuild (via site-builder)

**Output**: Updated blog entity

**Note**: Status field remains for future use, but blog:publish doesn't change it. Filtering is done at build time.

## Implementation Example

```typescript
export class BlogPlugin extends ServicePlugin<BlogConfig> {
  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    // Register the blog entity type
    context.registerEntityType("blog", blogPostSchema, blogPostAdapter);

    // Register site-builder templates and routes
    this.registerBlogTemplates(context);
    this.registerBlogRoutes(context);
  }

  protected override async getTools(): Promise<PluginTool[]> {
    return [
      {
        name: `${this.id}:generate`,
        description:
          "Generate a blog post using AI from existing brain content",
        inputSchema: {
          prompt: z.string().optional().default(this.config.defaultPrompt),
          coverImage: z.string().optional(),
          seriesName: z.string().optional(),
          seriesIndex: z.number().optional(),
        },
        handler: async (input) => {
          const { prompt, coverImage, seriesName, seriesIndex } = input;

          // AI queries brain for relevant content
          const brainContent =
            await this.context.aiService.queryKnowledge(prompt);

          // AI generates blog post
          const generated = await this.context.aiService.generateBlogPost({
            prompt,
            context: brainContent,
          });

          // Generate slug
          const slug = generated.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");

          // Get author from profile
          const profile = await this.context.entityService.getEntity(
            "profile",
            "PROFILE",
          );
          const author = profile.metadata.name;

          // Handle series indexing
          let finalSeriesIndex = seriesIndex;
          if (seriesName && !seriesIndex) {
            const seriesPosts = await this.context.entityService.search({
              entityType: "blog",
              filter: { "metadata.seriesName": seriesName },
              sort: { "metadata.publishedAt": "asc" },
            });
            finalSeriesIndex = seriesPosts.length + 1;
          }

          // Create entity
          return await this.context.entityService.createEntity({
            entityType: "blog",
            content: generated.content,
            metadata: {
              title: generated.title,
              slug,
              status: "draft",
              excerpt: generated.excerpt,
              author,
              ...(coverImage && { coverImage }),
              ...(seriesName && { seriesName }),
              ...(finalSeriesIndex && { seriesIndex: finalSeriesIndex }),
            },
            source: `plugin:${this.id}`,
          });
        },
      },
      {
        name: `${this.id}:publish`,
        description: "Publish a blog post",
        inputSchema: {
          id: z.string().describe("Post ID"),
        },
        handler: async (input) => {
          const { id } = input;
          const post = await this.context.entityService.getEntity("blog", id);

          // Set publishedAt
          const updated = await this.context.entityService.updateEntity(
            "blog",
            id,
            {
              metadata: {
                ...post.metadata,
                publishedAt: new Date().toISOString(),
              },
            },
          );

          // Trigger production rebuild
          await this.context.jobQueue.enqueue({
            type: "site-builder:build-production",
          });

          return updated;
        },
      },
    ];
  }
}
```

## File Structure Example

When a blog post is created:

```markdown
---
id: blog-abc123
entityType: blog
metadata:
  title: "Building a Better Blog"
  slug: "building-a-better-blog"
  status: draft
  excerpt: "Exploring how AI can help create engaging blog content from existing knowledge."
  author: "Jane Developer"
  coverImage: "https://hackmd.io/_uploads/xyz123.png"
  seriesName: "AI Writing Tools"
  seriesIndex: 1
createdAt: 2025-01-30T10:00:00Z
source: plugin:blog
---

# Building a Better Blog

AI-generated content goes here, synthesized from existing brain knowledge...
```

## Site Builder Integration

### Build Filtering

**Preview builds** (`bun run preview`):

- Show ALL blog posts (draft + published)
- Include draft posts in series navigation/TOC

**Production builds** (`bun run build`):

- Show ONLY published blog posts
- Filter at build time based on presence of `publishedAt` field

### Routes

Plugin auto-registers these routes:

- `/blog` - List all posts (BlogList template)
- `/blog/[slug]` - Individual post (BlogPost template)
- `/blog/series/[name]` - Series list, auto-generated for each unique seriesName (SeriesList template)

### Templates

**BlogList** (`/blog`):

- Display list of posts with titles, excerpts, authors, dates
- Show cover image thumbnails (if coverImage present)
- Show series badge on posts that are part of series
- Sort by publishedAt desc (or createdAt for drafts)
- Filter based on build mode

**BlogPost** (`/blog/[slug]`):

- Display cover image at top (if coverImage present)
- Display full post content (markdown rendered)
- Show post metadata (title, author, date)
- Series features (if post is part of series):
  - Series navigation (prev/next links)
  - Series table of contents (all posts in series with current highlighted)
  - Calculate series total dynamically at render time
- Respect build mode for draft posts in series TOC

**SeriesList** (`/blog/series/[name]`):

- List all posts in specific series
- Sort by seriesIndex (chronological order)
- Show title, excerpt, date, cover image (if present) for each
- Include draft posts in preview mode only
- Show series progress (e.g., "Part 1 of 3")

## Series Features

### Series Index Logic

1. **Explicit index**: User provides both seriesName and seriesIndex → use them directly
2. **Auto-index**: User provides seriesName only → query existing posts in series, sort by publishedAt, assign max(index) + 1
3. **No series**: Neither provided → no series metadata

### Series Display Components

**Series Navigation** (prev/next):

```tsx
<div class="series-nav">
  {prevPost && (
    <a href={`/blog/${prevPost.slug}`}>← Previous: {prevPost.title}</a>
  )}
  {nextPost && <a href={`/blog/${nextPost.slug}`}>Next: {nextPost.title} →</a>}
</div>
```

**Series Table of Contents**:

```tsx
<div class="series-toc">
  <h3>Series: {seriesName}</h3>
  <ol>
    {seriesPosts.map((post) => (
      <li class={post.id === currentPost.id ? "current" : ""}>
        <a href={`/blog/${post.slug}`}>{post.title}</a>
        {post.status === "draft" && <span class="draft-badge">Draft</span>}
      </li>
    ))}
  </ol>
</div>
```

**Series Badge** (on blog list):

```tsx
{
  post.metadata.seriesName && (
    <span class="series-badge">
      {post.metadata.seriesName} - Part {post.metadata.seriesIndex}
    </span>
  );
}
```

### Draft Handling in Series

- **Preview mode**: Include ALL posts (draft + published) in series features
- **Production mode**: Only show published posts (filter by publishedAt presence)
- **Series total**: Calculate dynamically based on visible posts for current build mode

## Cover Images

### Image Storage

Cover images are stored as **URLs** in the `coverImage` metadata field. No file upload or storage infrastructure needed.

**Supported sources:**

- **HackMD CDN**: `https://hackmd.io/_uploads/xyz.png` (recommended)
- **External URLs**: Any publicly accessible image URL
- **Future**: Local assets in `seed-content/assets/` (requires directory-sync enhancement)

### How It Works

1. **Manual input**: User provides image URL when calling `blog:generate`

   ```typescript
   await tools.execute("blog:generate", {
     prompt: "Write about TypeScript",
     coverImage: "https://hackmd.io/_uploads/abc123.png",
   });
   ```

2. **Storage**: URL saved to `metadata.coverImage` field

3. **Display**: Templates render standard HTML:

   ```tsx
   {
     post.metadata.coverImage && (
       <img
         src={post.metadata.coverImage}
         alt={post.metadata.title}
         class="cover-image"
       />
     );
   }
   ```

4. **Markdown rendering**: The existing `marked` library handles image URLs transparently - no special processing needed

### HackMD Integration (Future)

When HackMD sync plugin is implemented:

- Extract cover image automatically from first image in document
- Or use explicit frontmatter: `coverImage: https://...`
- HackMD's CDN URLs persist with documents
- No manual URL input needed for HackMD-sourced posts

### Advantages

- **No infrastructure**: No upload, storage, or CDN management needed
- **Fast**: Images served from external CDNs (HackMD, etc.)
- **Portable**: URLs work anywhere, copy markdown files freely
- **Simple**: Just a string field, no complex file handling

## Testing

```typescript
describe("BlogPlugin", () => {
  describe("blog:generate", () => {
    it("should generate blog post with AI", async () => {
      const result = await tools.execute("blog:generate", {
        prompt: "Write about TypeScript best practices",
      });

      expect(result.entityType).toBe("blog");
      expect(result.metadata.title).toBeDefined();
      expect(result.metadata.slug).toMatch(/^[a-z0-9-]+$/);
      expect(result.metadata.excerpt).toBeDefined();
      expect(result.metadata.author).toBe("Jane Developer");
      expect(result.metadata.status).toBe("draft");
    });

    it("should auto-assign series index chronologically", async () => {
      // Create first post in series
      await tools.execute("blog:generate", {
        prompt: "Part 1",
        seriesName: "Test Series",
        seriesIndex: 1,
      });

      // Publish it (sets publishedAt)
      await tools.execute("blog:publish", { id: post1.id });

      // Create second post without index
      const post2 = await tools.execute("blog:generate", {
        prompt: "Part 2",
        seriesName: "Test Series",
      });

      expect(post2.metadata.seriesIndex).toBe(2);
    });
  });

  describe("blog:publish", () => {
    it("should set publishedAt and trigger rebuild", async () => {
      const draft = await tools.execute("blog:generate", {
        prompt: "Test",
      });

      const published = await tools.execute("blog:publish", {
        id: draft.id,
      });

      expect(published.metadata.publishedAt).toBeDefined();
      // Verify rebuild job was enqueued
    });
  });
});
```

## Benefits of This Approach

1. **AI-Powered**: Generates content from existing brain knowledge
2. **Simplicity**: No duplicate CRUD logic, uses entity system
3. **Consistency**: Uses existing entity patterns
4. **File-based**: Easy to edit posts in any text editor
5. **Portable**: Markdown files can be moved/backed up easily
6. **Git-friendly**: Changes tracked naturally in version control
7. **Series Support**: Organize related posts into series with automatic indexing
8. **Draft Workflow**: Preview drafts before publishing to production
9. **Cover Images**: External URL storage (HackMD CDN, etc.) with no infrastructure needed

## Future Enhancements (If Needed)

- **AI-generated cover images**: Generate cover images automatically if none provided (requires image storage/upload solution like Cloudinary or HackMD API)
- **HackMD sync plugin**: Auto-sync HackMD documents as blog posts, extract cover images from first image
- Auto-generate table of contents from markdown headers within posts
- RSS feed generation (read blog entities, generate XML)
- Tags/categories (add to metadata if needed)
- Related posts suggestions (based on embeddings)
- Blog post scheduling (publishAt future timestamp)
- Blog post archiving (status: "archived")
- Multi-author support (author as array)
- Comments integration
- Social media preview cards (og:image, etc.)
- Local asset support (store images in seed-content/assets/ with directory-sync enhancement)

## Notes

- No `blog:list` tool - users can use generic entity search tools
- No `blog:unpublish` tool - users can manually edit markdown to remove publishedAt
- Status field exists but isn't currently used by tools - filtering is done via publishedAt presence
- Series total is calculated dynamically at render time, not stored in metadata
- Author always comes from profile entity, ensuring consistency
