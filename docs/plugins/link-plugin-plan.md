# Link Plugin Planning Document

## Overview

The Link plugin provides web content capture for the Personal Brain system using structured content formatting (following the topics plugin pattern) instead of metadata for storing link information.

## Core Philosophy

- Links are markdown entities with structured content sections
- Use StructuredContentFormatter for consistent data organization
- Let AI handle content extraction and summarization
- Minimal/no frontmatter needed

## Entity Schema

```typescript
// Link body schema (stored in content sections, not metadata)
export const linkBodySchema = z.object({
  url: z.string().url(),
  description: z.string(),
  summary: z.string(),
  content: z.string(), // Main extracted content
  tags: z.array(z.string()),
  domain: z.string(),
  capturedAt: z.string().datetime(),
});

// Minimal entity schema
export const linkSchema = z.object({
  id: z.string(),
  entityType: z.literal("link"),
  content: z.string(), // Structured markdown content
  metadata: z.object({}), // Empty or minimal
  embedding: z.array(z.number()).optional(),
  createdAt: z.string().datetime(),
  source: z.string(),
});
```

## Minimal Plugin Structure

```
plugins/link/
├── package.json
├── src/
│   ├── index.ts
│   ├── config.ts
│   ├── schemas/
│   │   └── link.ts
│   ├── adapters/
│   │   └── link-adapter.ts
│   └── tools/
│       └── index.ts
└── test/
    └── plugin.test.ts
```

## Configuration

```typescript
export const linkConfigSchema = z.object({
  enableSummarization: z
    .boolean()
    .default(true)
    .describe("Generate AI summaries for captured links"),
  autoTag: z
    .boolean()
    .default(true)
    .describe("Automatically generate tags from content"),
});
```

## Core Tools

```typescript
// Minimal link operations
`link:capture` - Capture a web link
  - url: string
  - tags?: string[]

`link:list` - List captured links
  - limit?: number

`link:search` - Search links
  - query?: string
  - tags?: string[]
```

## Link Adapter (Following Topics Pattern)

```typescript
export class LinkAdapter implements EntityAdapter<LinkEntity> {
  public readonly entityType = "link";
  public readonly schema = linkSchema;

  private createFormatter(title: string): StructuredContentFormatter<LinkBody> {
    return new StructuredContentFormatter(linkBodySchema, {
      title,
      mappings: [
        { key: "url", label: "URL", type: "string" },
        { key: "description", label: "Description", type: "string" },
        { key: "summary", label: "Summary", type: "string" },
        { key: "content", label: "Content", type: "string" },
        { key: "tags", label: "Tags", type: "array", itemType: "string" },
        { key: "domain", label: "Domain", type: "string" },
        { key: "capturedAt", label: "Captured", type: "string" },
      ],
    });
  }

  public createLinkBody(params: {
    title: string;
    url: string;
    description: string;
    summary: string;
    content: string;
    tags: string[];
  }): string {
    const formatter = this.createFormatter(params.title);
    return formatter.format({
      url: params.url,
      description: params.description,
      summary: params.summary,
      content: params.content,
      tags: params.tags,
      domain: new URL(params.url).hostname,
      capturedAt: new Date().toISOString(),
    });
  }

  public parseLinkBody(body: string): LinkBody & { title: string } {
    // Extract title from H1
    const titleMatch = body.match(/^#\s+(.+)$/m);
    const title = titleMatch?.[1]?.trim() ?? "Untitled Link";

    const formatter = this.createFormatter(title);
    const parsed = formatter.parse(body);

    return { ...parsed, title };
  }

  public toMarkdown(entity: LinkEntity): string {
    return entity.content;
  }

  public fromMarkdown(markdown: string): Partial<LinkEntity> {
    return {
      content: markdown,
      entityType: "link",
    };
  }

  public extractMetadata(_entity: LinkEntity): Record<string, unknown> {
    return {}; // All data stored in content body
  }
}
```

## Implementation

```typescript
export class LinkPlugin extends ServicePlugin<LinkConfig> {
  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    // Register the link entity type with adapter
    const linkAdapter = new LinkAdapter();
    context.registerEntityType("link", linkSchema, linkAdapter);
  }

  protected override async getTools(): Promise<PluginTool[]> {
    return [
      {
        name: `${this.id}:capture`,
        description: "Capture a web link",
        inputSchema: {
          url: z.string().url().describe("URL to capture"),
          tags: z.array(z.string()).optional().describe("Tags"),
        },
        handler: async (input) => {
          const { url, tags } = input;

          // Let AI handle extraction
          const extracted = await this.context.aiService.complete({
            prompt: `Fetch and analyze this URL: ${url}
            
            Return JSON with:
            - title: page title
            - description: one sentence description  
            - summary: 2-3 paragraph summary
            - content: main content in markdown (max 5000 chars)
            - suggested_tags: array of 3-5 relevant tags`,
          });

          const data = JSON.parse(extracted);

          // Create structured content using adapter
          const linkAdapter = new LinkAdapter();
          const linkBody = linkAdapter.createLinkBody({
            title: data.title,
            url,
            description: data.description,
            summary: data.summary,
            content: data.content,
            tags: tags || data.suggested_tags,
          });

          // Save as entity
          return await this.context.entityService.createEntity({
            entityType: "link",
            content: linkBody,
            metadata: {}, // Empty
            source: `plugin:${this.id}`,
          });
        },
      },
      {
        name: `${this.id}:list`,
        description: "List captured links",
        inputSchema: {
          limit: z.number().optional().describe("Maximum results"),
        },
        handler: async (input) => {
          const { limit = 10 } = input;

          return await this.context.entityService.search({
            entityType: "link",
            sort: { createdAt: "desc" },
            limit,
          });
        },
      },
      {
        name: `${this.id}:search`,
        description: "Search links",
        inputSchema: {
          query: z.string().optional().describe("Search query"),
          tags: z.array(z.string()).optional().describe("Filter by tags"),
        },
        handler: async (input) => {
          const { query, tags } = input;

          // Search in content (which includes all structured data)
          return await this.context.entityService.search({
            entityType: "link",
            query,
            // Tags are in the content body, will be searched
            limit: 20,
          });
        },
      },
    ];
  }
}
```

## Example Stored Link

When a link is captured, it becomes a markdown file like this:

```markdown
# How to Build Modern Web Apps

## URL

https://example.com/modern-web-apps

## Description

A comprehensive guide to building scalable web applications with modern tools and practices.

## Summary

This article explores the current landscape of web development, focusing on the tools and methodologies that have become essential for building modern applications. It covers everything from choosing the right framework to implementing CI/CD pipelines.

The guide emphasizes the importance of developer experience alongside user experience, showing how modern tooling can improve both. Special attention is given to performance optimization, security best practices, and maintaining code quality at scale.

## Content

Modern web development has evolved significantly over the past decade. What once required complex server setups and manual deployment processes can now be accomplished with a few commands...

[Main article content continues in markdown format]

## Tags

- web-development
- javascript
- architecture
- best-practices

## Domain

example.com

## Captured

2025-01-30T10:00:00Z
```

## Benefits of This Approach

1. **Consistency**: Follows the same pattern as topics plugin
2. **Human-readable**: Easy to read and edit manually
3. **AI-powered**: Leverages AI for content extraction
4. **Simple**: No complex metadata or HTML parsing needed
5. **Searchable**: All content is in the body, easily searchable
6. **Git-friendly**: Clean diffs for version control

## Testing

```typescript
describe("LinkPlugin", () => {
  it("should capture link with structured content", async () => {
    const result = await tools.execute("link:capture", {
      url: "https://example.com",
    });

    expect(result.entityType).toBe("link");
    expect(result.content).toContain("## URL");
    expect(result.content).toContain("https://example.com");
  });

  it("should parse link body correctly", async () => {
    const adapter = new LinkAdapter();
    const parsed = adapter.parseLinkBody(sampleLinkContent);

    expect(parsed.url).toBe("https://example.com");
    expect(parsed.tags).toBeInstanceOf(Array);
  });
});
```

## Implementation Phases

### Phase 1: MVP

- Basic URL capture with AI extraction
- Structured content storage
- Simple list and search

### Phase 2: Enhancements

- Better AI prompts for extraction
- Domain-specific extraction rules
- Related links discovery

### Phase 3: Advanced (Future)

- Browser extension
- Bookmarklet support
- Archive.org fallback for dead links
- RSS feed monitoring

The key is keeping it minimal and leveraging AI for the heavy lifting while maintaining consistency with the existing plugin patterns.
