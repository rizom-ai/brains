# Blog Plugin Planning Document

## Overview

The Blog plugin provides a thin layer over the entity system to make writing blog posts easier. Since all entities are markdown files, we leverage the existing file-based storage.

## Core Philosophy

- Blog posts are just markdown files with specific frontmatter
- Leverage existing entity CRUD operations
- Focus on blog-specific workflows, not reimplementing storage

## Entity Schema

```typescript
export const blogPostSchema = z.object({
  // BaseEntity fields inherited
  id: z.string(),
  entityType: z.literal("blog"),
  content: z.string(), // Markdown content
  metadata: z.object({
    title: z.string(),
    slug: z.string().optional(), // Auto-generate from title if not provided
    status: z.enum(["draft", "published"]).default("draft"),
    publishedAt: z.string().datetime().optional(),
    tags: z.array(z.string()).default([]),
  }),
  embedding: z.array(z.number()).optional(),
  createdAt: z.string().datetime(),
  source: z.string(),
});
```

## Minimal Plugin Structure

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
│   └── tools/
│       └── index.ts
└── test/
    └── plugin.test.ts
```

## Configuration

```typescript
export const blogConfigSchema = z.object({
  defaultStatus: z.enum(["draft", "published"]).default("draft"),
});
```

## Core Tools

```typescript
// Minimal blog-specific operations
`blog:new` - Create a new blog post
  - title: string
  - content?: string (defaults to template)
  - tags?: string[]

`blog:publish` - Change status to published
  - id: string

`blog:unpublish` - Change status to draft
  - id: string

`blog:list` - List blog posts (wrapper around entity search)
  - status?: "draft" | "published" | "all"
```

## Implementation

```typescript
export class BlogPlugin extends ServicePlugin<BlogConfig> {
  protected override async onRegister(context: ServicePluginContext): Promise<void> {
    // Register the blog entity type
    context.registerEntityType("blog", blogPostSchema, blogPostAdapter);
  }

  protected override async getTools(): Promise<PluginTool[]> {
    return [
      {
        name: `${this.id}:new`,
        description: "Create a new blog post",
        inputSchema: {
          title: z.string().describe("Blog post title"),
          content: z.string().optional().describe("Initial content"),
          tags: z.array(z.string()).optional().describe("Tags"),
        },
        handler: async (input) => {
          const { title, content, tags } = input;
          const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
          
          // Create entity using existing entity service
          return await this.context.entityService.createEntity({
            entityType: "blog",
            content: content || `# ${title}\n\n`,
            metadata: {
              title,
              slug,
              status: this.config.defaultStatus,
              tags: tags || [],
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
          
          return await this.context.entityService.updateEntity("blog", id, {
            metadata: {
              ...post.metadata,
              status: "published",
              publishedAt: new Date().toISOString(),
            },
          });
        },
      },
      {
        name: `${this.id}:list`,
        description: "List blog posts",
        inputSchema: {
          status: z.enum(["draft", "published", "all"]).optional(),
        },
        handler: async (input) => {
          const { status = "all" } = input;
          
          const filter = status === "all" 
            ? {} 
            : { "metadata.status": status };
          
          return await this.context.entityService.search({
            entityType: "blog",
            filter,
            sort: { createdAt: "desc" },
          });
        },
      },
    ];
  }
}
```

## File Structure Example

When a blog post is created, it becomes a markdown file:

```markdown
---
id: blog-123
entityType: blog
metadata:
  title: "My First Post"
  slug: "my-first-post"
  status: draft
  tags: ["thoughts", "meta"]
createdAt: 2025-01-30T10:00:00Z
source: plugin:blog
---

# My First Post

Content goes here...
```

## Site Builder Integration

The blog plugin just needs to register the entity type. Site-builder already handles:
- Rendering markdown entities
- Generating routes based on entity types
- Creating list pages

## Benefits of This Approach

1. **Simplicity**: No duplicate CRUD logic
2. **Consistency**: Uses existing entity patterns
3. **File-based**: Easy to edit posts in any text editor
4. **Portable**: Markdown files can be moved/backed up easily
5. **Git-friendly**: Changes tracked naturally in version control

## Testing

```typescript
describe("BlogPlugin", () => {
  it("should create blog post as entity", async () => {
    const result = await tools.execute("blog:new", {
      title: "Test Post",
    });
    
    expect(result.entityType).toBe("blog");
    expect(result.metadata.slug).toBe("test-post");
  });
  
  it("should publish post by updating metadata", async () => {
    const post = await tools.execute("blog:new", { title: "Draft" });
    const published = await tools.execute("blog:publish", { id: post.id });
    
    expect(published.metadata.status).toBe("published");
    expect(published.metadata.publishedAt).toBeDefined();
  });
});
```

## Future Enhancements (If Needed)

- Auto-generate table of contents from markdown headers
- RSS feed generation (read blog entities, generate XML)
- Categories (just another metadata field)
- Series support (metadata.series field)

The key is keeping the plugin minimal and leveraging the existing entity infrastructure.