# Plan: Complete Newsletter Plugin Tools

## Context

The newsletter plugin currently only has subscriber management tools (`subscribe`, `unsubscribe`, `list_subscribers`) and a basic `send` tool that bypasses the entity system. It's missing the content generation and entity management tools that blog and social-media plugins have.

**Current state:**

- Uses `createTypedTool()` pattern (differs from blog's `createTool()`)
- Has newsletter entity schema with status workflow: `draft` → `queued` → `sent` → `failed`
- Has publish pipeline integration
- Has Buttondown API client
- `send` tool sends raw content directly (bypasses entity tracking)
- Missing: generate, create, list, get, publish tools

**Target state (matching blog/social-media patterns):**

- AI-powered newsletter generation from posts, prompts, or direct content
- Full entity CRUD via tools
- Job-based async generation with progress reporting
- **Remove `send` tool** - replace with entity-based `publish` for better tracking
- Keep subscriber management tools unchanged (`subscribe`, `unsubscribe`, `list_subscribers`)

## New Tools to Add

### 1. `newsletter_generate` (Job-based, like blog/social-media)

Queue a job to AI-generate newsletter content.

**Input schema:**

```typescript
{
  prompt?: string,           // AI generation prompt
  sourceEntityIds?: string[], // Generate from blog posts
  sourceEntityType?: "post", // Type of source entities
  content?: string,          // Direct content (skip AI)
  subject?: string,          // Newsletter subject (AI-generated if not provided)
  addToQueue?: boolean,      // Create as "queued" vs "draft"
}
```

**Validation:** At least one of `prompt`, `sourceEntityIds`, or `content` required.

**Generation paths (like social-media):**

1. Direct content path - use provided content
2. Source entity path - aggregate from blog posts
3. Prompt path - AI generates from prompt

### 2. `newsletter_create` (Synchronous)

Create a newsletter draft directly without AI.

**Input schema:**

```typescript
{
  subject: string,
  content: string,
  status?: "draft" | "queued",
  entityIds?: string[],
  scheduledFor?: string,
}
```

### 3. `newsletter_list` (Synchronous)

List newsletters with filtering.

**Input schema:**

```typescript
{
  status?: "draft" | "queued" | "sent" | "failed",
  limit?: number,
}
```

### 4. `newsletter_get` (Synchronous)

Get a specific newsletter by ID.

**Input schema:**

```typescript
{
  id: string,
}
```

### 5. `newsletter_publish` (Synchronous)

Publish a draft newsletter (send via Buttondown).

**Input schema:**

```typescript
{
  id: string,
  immediate?: boolean,      // Send now vs keep as draft in Buttondown
  scheduledFor?: string,    // Schedule for later
}
```

## Files to Create

### `plugins/newsletter/src/handlers/generation-handler.ts`

Job handler for newsletter generation (extends `BaseJobHandler`).

**Responsibilities:**

- Fetch source entities if `sourceEntityIds` provided
- Call `context.ai.generate()` with template
- Create newsletter entity via entity service
- Report progress via PROGRESS_STEPS

### `plugins/newsletter/src/templates/newsletter.ts`

AI template for newsletter generation.

## Tools Summary (After Changes)

**Keep unchanged:**

- `newsletter_subscribe` - Subscribe email
- `newsletter_unsubscribe` - Unsubscribe email
- `newsletter_list_subscribers` - List subscribers

**Remove:**

- `newsletter_send` - Replaced by entity-based workflow

**Add new:**

- `newsletter_generate` - AI-generate content (job-based)
- `newsletter_create` - Create draft directly
- `newsletter_list` - List newsletters
- `newsletter_get` - Get newsletter by ID
- `newsletter_publish` - Send a newsletter entity

## Files to Modify

### `plugins/newsletter/src/tools/index.ts`

- Remove `send` tool and `sendParamsSchema`
- Import newsletter schema, createNewsletter factory
- Add input schemas with `.describe()` on all fields
- Add `generate` tool (enqueues job)
- Add `create`, `list`, `get`, `publish` tools (synchronous)

### `plugins/newsletter/src/index.ts`

- Register generation job handler in `onInstall()`
- Register AI template for newsletter generation

### `plugins/newsletter/src/config.ts`

- Add optional `defaultPrompt` config for generation

## Tool Response Pattern

Use existing `createTypedTool()` pattern for consistency within newsletter plugin:

```typescript
createTypedTool(
  pluginId,
  "generate",
  "Queue a job to generate newsletter content from posts or a prompt",
  generateParamsSchema,
  async (input, toolContext) => {
    const jobId = await context.jobs.enqueue("newsletter-generation", ...);
    return toolSuccess({ jobId }, "Newsletter generation job queued");
  },
)
```

## Generation Job Data Schema

```typescript
{
  prompt?: string,
  sourceEntityIds?: string[],
  sourceEntityType?: "post",
  content?: string,
  subject?: string,
  addToQueue?: boolean,
}
```

## AI Template Content

Newsletter template should:

- Accept source posts or prompt
- Generate engaging subject line
- Create cohesive newsletter content
- Include intro/outro sections
- Support markdown formatting

## Test Files to Create/Update

### `plugins/newsletter/test/generate-tool.test.ts`

- Test job enqueueing
- Test input validation

### `plugins/newsletter/test/generation-handler.test.ts`

- Test direct content path
- Test source entity path
- Test prompt generation path
- Test progress reporting

### Update `plugins/newsletter/test/tools.test.ts`

- Add tests for `create`, `list`, `get`, `publish` tools

## Verification

1. `bun run typecheck` - no errors
2. `bun test plugins/newsletter` - all tests pass
3. Manual test via Matrix:
   - "Generate a newsletter from my recent blog posts"
   - "Create a newsletter draft with subject 'Weekly Update'"
   - "List my newsletter drafts"
   - "Get newsletter [id]"
   - "Publish newsletter [id]"

## Implementation Order

1. Add input schemas to `tools/index.ts`
2. Add `create`, `list`, `get` tools (synchronous, no dependencies)
3. Create generation handler
4. Add `generate` tool (job-based)
5. Add `publish` tool
6. Register handler and template in plugin
7. Write tests
8. Manual verification
