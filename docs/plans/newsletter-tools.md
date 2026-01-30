# Plan: Complete Newsletter Plugin Tools

> **Status: COMPLETED** (2025-01-30)

## Context

The newsletter plugin currently only has subscriber management tools (`subscribe`, `unsubscribe`, `list_subscribers`) and a basic `send` tool that bypasses the entity system. It's missing the content generation tools that blog and social-media plugins have.

**Current state:**

- Uses `createTypedTool()` pattern
- Has newsletter entity schema with status workflow: `draft` → `queued` → `sent` → `failed`
- Has publish pipeline integration
- Has Buttondown API client
- `send` tool sends raw content directly (bypasses entity tracking)
- Missing: generate tool

**Target state (matching blog/social-media patterns):**

- `newsletter_generate` - Job-based AI generation (like blog/social-media)
- No CRUD tools - use `system_list`, `system_get` for entity access
- No publish tool - use existing publish-pipeline integration
- **Remove `send` tool** - replaced by generate + publish-pipeline workflow
- Keep subscriber management tools unchanged

## New Tool to Add

### `newsletter_generate` (Job-based, like blog/social-media)

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

## Entity Access (No Tools Needed)

Following blog/social-media pattern, use system tools instead of plugin-specific tools:

- **List newsletters**: `system_list` with `entityType: "newsletter"`
- **Get newsletter**: `system_get` with `entityType: "newsletter"` and `id`
- **Publish newsletter**: `publish-pipeline_publish` with `entityType: "newsletter"`

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

- `newsletter_send` - Replaced by generate + publish-pipeline workflow

**Add new:**

- `newsletter_generate` - AI-generate content (job-based)

**Total: 4 tools** (was 4, adding 1, removing 1)

## Files to Modify

### `plugins/newsletter/src/tools/index.ts`

- Remove `send` tool and `sendParamsSchema`
- Add `generate` tool schema with `.describe()` on all fields
- Add `generate` tool (enqueues job)

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
- Test input validation (at least one of prompt/sourceEntityIds/content required)

### `plugins/newsletter/test/generation-handler.test.ts`

- Test direct content path
- Test source entity path
- Test prompt generation path
- Test progress reporting

### Update `plugins/newsletter/test/tools.test.ts`

- Remove tests for `send` tool

## Verification

1. `bun run typecheck` - no errors
2. `bun test plugins/newsletter` - all tests pass
3. Manual test via Matrix:
   - "Generate a newsletter from my recent blog posts"
   - "Generate a newsletter about topic X"
   - Use `system_list` to see newsletters
   - Use `publish-pipeline_publish` to send

## Implementation Order

1. Remove `send` tool from `tools/index.ts`
2. Create generation handler (`handlers/generation-handler.ts`)
3. Add `generate` tool (job-based)
4. Register handler and template in plugin
5. Write tests
6. Manual verification
