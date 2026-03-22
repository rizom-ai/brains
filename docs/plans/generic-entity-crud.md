# Plan: Generic Entity CRUD in System Plugin

## Context

Each plugin implements its own create/generate tools with the same boilerplate. The system plugin should own the tool interface; plugins own the domain logic via standardized handlers.

## Architecture

```
User: "system_generate { entityType: 'post', prompt: 'write about AI' }"
  → System plugin (tool)
    → Queues job: "post:generation"
      → Blog plugin's handler (series logic, unique title, excerpt, etc.)
        → Creates entity
```

System plugin owns ALL entity tools under the `system_` prefix. Plugins register handlers under standardized job types. The plugin's handler contains all domain logic — the system tool is just the uniform entry point.

### Standardized job types

`{entityType}:{operation}`

| Job type                 | Handler owner       | What it does                          |
| ------------------------ | ------------------- | ------------------------------------- |
| `base:generation`        | note plugin         | AI-generates a note                   |
| `post:generation`        | blog plugin         | Series logic, unique title, excerpt   |
| `deck:generation`        | decks plugin        | Slide generation, skipAi mode         |
| `social-post:generation` | social-media plugin | Platform routing, source entity fetch |
| `link:capture`           | link plugin         | URL fetch + AI extraction             |
| `project:generation`     | portfolio plugin    | Related content search + enrichment   |
| `wish:create`            | wishlist plugin     | Semantic dedup + count increment      |

### Tools (all `system_` prefix)

| Tool              | Input                                  | Behavior                                                                                       |
| ----------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `system_create`   | entityType, title, content?, metadata? | Sync create. Slugify title → ID. For types with a `{type}:create` handler, queues job instead. |
| `system_generate` | entityType, prompt, options?           | Queues `{entityType}:generation` job. Plugin handler does the rest.                            |
| `system_update`   | entityType, id, content/fields         | Already done. Diff confirmation.                                                               |
| `system_delete`   | entityType, id                         | Already done. Title+preview confirmation.                                                      |
| `system_list`     | entityType, filter?                    | Unchanged                                                                                      |
| `system_get`      | entityType, id                         | Unchanged                                                                                      |
| `system_search`   | query, entityType?                     | Unchanged                                                                                      |

### What plugins lose (tools)

- `note_create`, `note_generate`
- `blog_generate` (blog_publish stays — it's not CRUD)
- `deck_generate`
- `social-media_generate`
- `portfolio_create`
- `wishlist_add`
- `link_capture`

### What plugins keep (tools)

| Plugin           | Keeps                                 | Why                                      |
| ---------------- | ------------------------------------- | ---------------------------------------- |
| blog             | `blog_publish`, `blog_enhance-series` | Status change + event pipeline, not CRUD |
| newsletter       | `newsletter_send`                     | External API integration                 |
| content-pipeline | `pipeline_publish`, `pipeline_queue`  | Orchestration                            |
| directory-sync   | `sync`, `git_sync`, `git_status`      | Infrastructure ops                       |

### What plugins keep (handlers)

Everything. The generation/create handlers stay in the plugins. They just register under standardized job types:

```typescript
// Before (in blog plugin):
context.jobs.registerHandler("generation", new BlogGenerationJobHandler(...));

// After:
context.jobs.registerHandler("post:generation", new BlogGenerationJobHandler(...));
```

### system_generate options passthrough

Plugin-specific options (platform, seriesName, skipAi, etc.) pass through as the `options` field:

```
system_generate {
  entityType: "social-post",
  prompt: "Share about our new feature",
  options: { platform: "linkedin", generateImage: true }
}
```

The system tool queues the job with these options. The plugin's handler reads them. The system tool doesn't validate plugin-specific options — schema validation happens in the handler.

## Steps

### Step 1: Standardize job types

- Each plugin changes its handler registration from ad-hoc to `{entityType}:{operation}`
- Update: note, blog, decks, social-media, portfolio, wishlist, link
- Tests: existing handler tests pass with new job types

### Step 2: Add system_create and system_generate (tests first)

- `system_create`: sync create for simple cases, queues `{type}:create` job if handler exists
- `system_generate`: queues `{type}:generation` job, returns jobId
- Tests verify routing to correct handlers

### Step 3: Remove plugin tools

- Remove `note_create`, `note_generate`, `blog_generate`, `deck_generate`, `portfolio_create`, `wishlist_add`, `social-media_generate`, `link_capture`
- Keep: `blog_publish`, `blog_enhance-series`, `newsletter_send`, pipeline tools, sync tools

### Step 4: Update eval test cases

- Update any YAML test cases referencing old tool names

## Key files

| File                                 | Change                                       |
| ------------------------------------ | -------------------------------------------- |
| `plugins/system/src/tools/index.ts`  | Add system_create, system_generate           |
| `plugins/system/test/`               | New tests for create, generate               |
| `plugins/note/src/plugin.ts`         | Register handler as `base:generation`        |
| `plugins/blog/src/plugin.ts`         | Register handler as `post:generation`        |
| `plugins/decks/src/plugin.ts`        | Register handler as `deck:generation`        |
| `plugins/social-media/src/plugin.ts` | Register handler as `social-post:generation` |
| `plugins/portfolio/src/plugin.ts`    | Register handler as `project:generation`     |
| `plugins/wishlist/src/plugin.ts`     | Register handler as `wish:create`            |
| `plugins/link/src/plugin.ts`         | Register handler as `link:capture`           |
| All plugin tools files               | Remove create/generate tools                 |
| All plugin test files                | Remove create/generate tool tests            |

## Verification

1. `bun test` — all tests pass
2. `bun run typecheck` / `bun run lint`
3. Via MCP: `system_create { entityType: "base", title: "Test" }` → note created
4. Via MCP: `system_generate { entityType: "post", prompt: "write about AI" }` → blog handler runs
5. Via MCP: `system_generate { entityType: "social-post", prompt: "share", options: { platform: "linkedin" } }` → social-media handler runs
6. Via MCP: `system_list { entityType: "post" }` → lists posts
