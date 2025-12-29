# Social Media Plugin Implementation Plan

## Overview

A plugin for multi-provider social media posting with:

- **LinkedIn** support (first provider, extensible to others)
- **Post buffer** - editable queue of drafts waiting to publish
- **Auto-generation** - create posts from blog posts/summaries via AI
- **Manual creation** - write posts directly
- **Cron publishing** - auto-publish next queued post at configurable interval

---

## Phase 1: Plugin Structure and Entity System

### 1.1 Create Plugin Directory Structure

```
plugins/social-media/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── plugin.ts
│   ├── config.ts
│   ├── schemas/social-post.ts
│   ├── adapters/social-post-adapter.ts
│   ├── datasources/social-post-datasource.ts
│   ├── handlers/
│   ├── tools/
│   ├── templates/
│   └── lib/
└── test/
```

**Reference**: `plugins/blog/package.json`, `plugins/decks/package.json`

### 1.2 Social Post Schema (`src/schemas/social-post.ts`)

3-layer schema pattern:

```typescript
// Frontmatter (human-editable YAML)
socialPostFrontmatterSchema = z.object({
  content: z.string(),
  platform: z.enum(["linkedin"]), // Extensible later
  status: z.enum(["draft", "queued", "published", "failed"]),
  queueOrder: z.number().optional(),
  publishedAt: z.string().datetime().optional(),
  platformPostId: z.string().optional(),
  sourceEntityId: z.string().optional(),
  sourceEntityType: z.string().optional(),
  lastError: z.string().optional(),
});

// Metadata (fast queries)
socialPostMetadataSchema = z.object({
  slug: z.string(),
  platform: z.enum(["linkedin"]),
  status: z.enum(["draft", "queued", "published", "failed"]),
  queueOrder: z.number().optional(),
  publishedAt: z.string().datetime().optional(),
});

// Entity
socialPostSchema = baseEntitySchema.extend({
  entityType: z.literal("social-post"),
  metadata: socialPostMetadataSchema,
});
```

**Reference**: `plugins/blog/src/schemas/blog-post.ts`

### 1.3 Social Post Adapter (`src/adapters/social-post-adapter.ts`)

- `fromMarkdown()` - parse frontmatter, auto-generate slug from content preview
- `toMarkdown()` - serialize entity back to markdown
- `extractMetadata()` - sync frontmatter to metadata

**Reference**: `plugins/blog/src/adapters/blog-post-adapter.ts`

### 1.4 Social Post DataSource (`src/datasources/social-post-datasource.ts`)

- Query by platform, status
- `fetchQueuedPosts()` - get posts sorted by queueOrder for publishing
- `fetchNextInQueue()` - get single next post to publish

**Reference**: `plugins/blog/src/datasources/blog-datasource.ts`

---

## Phase 2: Configuration

### 2.1 Config Schema (`src/config.ts`)

```typescript
socialMediaConfigSchema = z.object({
  linkedin: z
    .object({
      accessToken: z.string().optional(),
      refreshToken: z.string().optional(),
    })
    .optional(),
  publishInterval: z.number().default(3600000), // 1 hour
  enabled: z.boolean().default(true),
  defaultPrompt: z.string().default("Create an engaging social media post"),
});
```

### 2.2 Environment Variables

```
LINKEDIN_ACCESS_TOKEN=...
LINKEDIN_REFRESH_TOKEN=...
```

---

## Phase 3: Tools

### 3.1 Generate Tool (`src/tools/generate.ts`)

Creates social posts from prompts OR existing content:

```typescript
generateInputSchema = z.object({
  prompt: z.string().optional(),
  platform: z.enum(["linkedin"]).default("linkedin"),
  sourceType: z.enum(["blog", "summary"]).optional(),
  sourceId: z.string().optional(),
  content: z.string().optional(), // Direct content (skip AI)
  addToQueue: z.boolean().default(true),
});
```

**Reference**: `plugins/blog/src/tools/generate.ts`

### 3.2 Queue Tool (`src/tools/queue.ts`)

Manages the post queue:

```typescript
queueInputSchema = z.object({
  action: z.enum(["add", "remove", "reorder", "list"]),
  postId: z.string().optional(),
  position: z.number().optional(),
});
```

### 3.3 Publish Tool (`src/tools/publish.ts`)

Manual publish:

```typescript
publishInputSchema = z.object({
  id: z.string().optional(),
  slug: z.string().optional(),
});
```

**Reference**: `plugins/blog/src/tools/publish.ts`

### 3.4 Edit Tool (`src/tools/edit.ts`)

Edit draft/queued posts:

```typescript
editInputSchema = z.object({
  id: z.string().optional(),
  content: z.string().optional(),
  status: z.enum(["draft", "queued"]).optional(),
});
```

---

## Phase 4: Job Handlers

### 4.1 Generation Handler (`src/handlers/generationHandler.ts`)

- Fetch source entity if `sourceType`/`sourceId` provided
- Generate content via AI template
- Create social-post entity
- Assign queueOrder if `addToQueue: true`

**Reference**: `plugins/blog/src/handlers/blogGenerationJobHandler.ts`

### 4.2 Publish Handler (`src/handlers/publishHandler.ts`)

- Get post entity
- Call LinkedIn API
- Update entity: `status: "published"`, `platformPostId`, `publishedAt`
- On error: `status: "failed"`, `lastError`

### 4.3 Publish Checker Handler (`src/handlers/publishCheckerHandler.ts`)

Self-re-enqueueing cron job:

```typescript
async process(data, jobId, progressReporter) {
  // 1. Query next queued post (lowest queueOrder)
  const next = await this.getNextQueuedPost();

  // 2. If found, enqueue publish job
  if (next) {
    await context.enqueueJob("publish", { postId: next.id });
  }

  // 3. Re-enqueue self for next interval
  await context.enqueueJob("publish-checker", {}, {
    delayMs: config.publishInterval,
    deduplication: "skip",
  });
}
```

**Reference**: `shell/job-queue/src/job-queue-service.ts` (delayMs, deduplication options)

---

## Phase 5: LinkedIn Integration

### 5.1 LinkedIn Client (`src/lib/linkedin-client.ts`)

```typescript
class LinkedInClient {
  async createPost(content: string): Promise<{ postId: string }>;
  async refreshAccessToken(): Promise<void>;
  async validateCredentials(): Promise<boolean>;
}
```

LinkedIn Share API v2: `POST https://api.linkedin.com/v2/ugcPosts`

### 5.2 Provider Interface (`src/lib/provider.ts`)

For future extensibility:

```typescript
interface SocialMediaProvider {
  platform: string;
  createPost(content: string): Promise<{ postId: string }>;
  validateCredentials(): Promise<boolean>;
}
```

---

## Phase 6: AI Templates

### 6.1 Generation Template (`src/templates/generation-template.ts`)

For creating posts from prompts.

### 6.2 From Blog Template (`src/templates/from-blog-template.ts`)

For creating posts that promote blog articles.

**Reference**: `plugins/blog/src/templates/generation-template.ts`

---

## Phase 7: Plugin Registration

### 7.1 Plugin Class (`src/plugin.ts`)

```typescript
class SocialMediaPlugin extends ServicePlugin<SocialMediaConfig> {
  async onRegister(context: ServicePluginContext) {
    // 1. Register entity type
    context.registerEntityType("social-post", socialPostSchema, socialPostAdapter);

    // 2. Register datasource
    context.registerDataSource(new SocialPostDataSource(...));

    // 3. Register templates
    context.registerTemplates({...});

    // 4. Register job handlers
    context.registerJobHandler("generation", ...);
    context.registerJobHandler("publish", ...);
    context.registerJobHandler("publish-checker", ...);

    // 5. Auto-start publish checker
    if (this.config.enabled) {
      await context.enqueueJob("publish-checker", {}, {
        deduplication: "skip",
      });
    }
  }

  async getTools(): Promise<PluginTool[]> {
    return [generateTool, queueTool, publishTool, editTool];
  }
}
```

**Reference**: `plugins/blog/src/plugin.ts`

---

## Phase 8: Testing

### Unit Tests

1. **Schema tests** - frontmatter parsing, status values
2. **Adapter tests** - fromMarkdown/toMarkdown, slug generation
3. **Handler tests** - generation, publishing, checker re-enqueueing
4. **Tool tests** - input validation, job enqueueing
5. **LinkedIn client tests** - mock API responses

### Fixtures (`test/fixtures/social-post-entities.ts`)

Mock entities for testing.

**Reference**: `plugins/blog/test/fixtures/blog-post-entities.ts`

---

## Key Files to Reference

| Pattern        | Reference File                                          |
| -------------- | ------------------------------------------------------- |
| 3-layer schema | `plugins/blog/src/schemas/blog-post.ts`                 |
| EntityAdapter  | `plugins/blog/src/adapters/blog-post-adapter.ts`        |
| DataSource     | `plugins/blog/src/datasources/blog-datasource.ts`       |
| Job handler    | `plugins/blog/src/handlers/blogGenerationJobHandler.ts` |
| Tools          | `plugins/blog/src/tools/generate.ts`, `publish.ts`      |
| Plugin class   | `plugins/blog/src/plugin.ts`                            |
| Job queue      | `shell/job-queue/src/job-queue-service.ts`              |
| Templates      | `plugins/blog/src/templates/generation-template.ts`     |

---

## Implementation Order

1. **Phase 1**: Entity system (schemas, adapter, datasource)
2. **Phase 2**: Configuration
3. **Phase 3**: Tools (generate, queue, publish, edit)
4. **Phase 4**: Job handlers (generation, publish, publish-checker)
5. **Phase 5**: LinkedIn integration
6. **Phase 6**: AI templates
7. **Phase 7**: Plugin registration and auto-start
8. **Phase 8**: Tests

---

## Status Flow

```
draft → queued → published
                ↘ failed (can retry → queued)
```

- **draft**: Created but not ready
- **queued**: Ready to publish, waiting in queue (ordered by queueOrder)
- **published**: Successfully posted (has platformPostId, publishedAt)
- **failed**: Publish error (has lastError, can move back to queued)
