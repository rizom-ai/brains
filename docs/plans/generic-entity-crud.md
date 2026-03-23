# Plan: Unified Entity Tools in System Plugin

## Context

Eight plugins expose their own create/generate tools with plugin-specific fields (seriesName, platform, skipAi, etc.) that the AI agent almost never uses. These fields add noise to the tool schema without providing value. Meanwhile, plugin handlers already contain all the domain logic — they don't need the tool to pass them hints.

## Design

One tool for content creation. The agent says what it wants; the brain figures out how.

```
system_create {
  entityType: string,                  // required — what to create
  title?: string,                      // optional — hint for entity name
  prompt?: string,                     // optional — triggers AI generation via plugin handler
  content?: string,                    // optional — direct content to store
  options?: Record<string, unknown>,   // optional — passthrough to handler for programmatic clients
}
```

**Routing logic:**

- `content` provided → direct create (sync). Slugify title → ID, store entity.
- `prompt` provided → queue `{entityType}:generation` job (async). Plugin handler does all domain logic.
- Both → handler uses prompt to enhance the content.
- Neither → error.

**Options passthrough:**
For programmatic MCP clients that need precision without putting structured data in a prompt string. The handler receives `options` alongside `prompt` and uses whichever is more specific. AI agents use the prompt; automation scripts use options.

```
// Automation script:
system_create { entityType: "social-post", prompt: "Share about launch", options: { platform: "linkedin" } }

// AI agent (same result):
system_create { entityType: "social-post", prompt: "Create a LinkedIn post about our launch" }
```

**Response:**

```typescript
{ entityId: string, status: "created" | "generating", jobId?: string }
```

The agent doesn't choose between create and generate — it describes what it wants. Status tells it what happened.

## What plugins lose (tools)

- `note_create`, `note_generate`
- `blog_generate`
- `deck_generate`
- `social-media_generate`
- `portfolio_create`

## What plugins keep (tools)

| Plugin           | Keeps                                               | Why                                 |
| ---------------- | --------------------------------------------------- | ----------------------------------- |
| blog             | `blog_publish`, `blog_enhance-series`               | Not content creation                |
| newsletter       | `newsletter_send`                                   | External API                        |
| content-pipeline | `pipeline_publish`, `pipeline_queue`                | Orchestration                       |
| link             | `link_capture`                                      | URL fetching workflow, not creation |
| wishlist         | `wishlist_add`                                      | Semantic dedup, not generic create  |
| directory-sync   | `sync`, `git_sync`, `git_status`                    | Infrastructure                      |
| image            | `image_upload`, `image_generate`, `image_set-cover` | Binary handling                     |

## What plugins keep (handlers)

Everything. Handlers register under `{entityType}:generation`:

```typescript
// Blog plugin:
context.jobs.registerHandler("post:generation", new BlogGenerationJobHandler(...));
// Handler owns: series logic, unique title, excerpt, slug generation
```

## Where do plugin-specific fields go?

They don't. The agent puts intent in the prompt:

- "Write a blog post for the AI Series" → handler detects series from prompt
- "Create a LinkedIn post about our launch" → handler detects platform from prompt
- "Write a deck for the Amsterdam conference" → handler detects event from prompt

If a field is truly needed programmatically (rare), the handler can expose it via brain.yaml config or a separate specialized tool later.

## Full system plugin tool surface

| Tool            | Input                                 | Behavior                   |
| --------------- | ------------------------------------- | -------------------------- |
| `system_create` | entityType, title?, prompt?, content? | Unified create/generate    |
| `system_update` | entityType, id, content/fields        | Diff confirmation          |
| `system_delete` | entityType, id                        | Title+preview confirmation |
| `system_list`   | entityType, filter?                   | Unchanged                  |
| `system_get`    | entityType, id                        | Unchanged                  |
| `system_search` | query, entityType?                    | Unchanged                  |

Six tools for all entity operations. Down from ~14 (6 system + 8 plugin create/generate).

## Steps

### Step 1: Standardize job types

Each plugin registers handler as `{entityType}:generation`:

- note → `base:generation`
- blog → `post:generation`
- decks → `deck:generation`
- social-media → `social-post:generation`
- portfolio → `project:generation`

### Step 2: Add unified system_create (tests first)

- Direct path: content provided → sync create
- Generate path: prompt provided → queue `{entityType}:generation` job
- Return `{ entityId, status, jobId? }`

### Step 3: Remove plugin create/generate tools

- Remove from: note, blog, decks, social-media, portfolio
- Keep: link_capture, wishlist_add, image tools, publish tools

### Step 4: Update eval test cases

- Update YAML test cases referencing old tool names

## Step 5: Thorough evals

This is a major change to the agent's tool surface. Write comprehensive evals to verify the AI agent handles the new tools correctly in real conversations:

**Direct create evals:**

- "Save this as a note: [content]" → agent uses system_create with content
- "Create a note called X" → agent uses system_create with title
- "Remember this for later: [content]" → agent infers entityType: base

**Generate evals:**

- "Write a blog post about X" → agent uses system_create with prompt, entityType: post
- "Create a presentation about X" → agent infers entityType: deck
- "Draft a LinkedIn post about X" → agent infers entityType: social-post
- "Write something about X for my portfolio" → agent infers entityType: project

**Implicit entity type evals:**

- Agent correctly infers entity type from conversational context without explicit entityType
- Agent falls back to "base" for ambiguous requests

**Series/platform via prompt (no typed fields) evals:**

- "Write a blog post for the AI Series about X" → handler detects series from prompt
- "Create a social post for LinkedIn about X" → handler detects platform from prompt

**Update/delete evals:**

- "Change the title of my post X to Y" → agent uses system_update with fields
- "Delete the note called X" → agent uses system_delete, confirms

**Edge cases:**

- Agent doesn't hallucinate old tool names (blog_generate, note_create)
- Agent handles "generating" status correctly (doesn't try to fetch entity immediately)
- Agent composes multi-step flows (create post → set cover image)

## Verification

1. `bun test` — all unit tests pass
2. `bun run eval` — all evals pass
3. `system_create { entityType: "base", title: "Test", content: "Hello" }` → `{ status: "created" }`
4. `system_create { entityType: "post", prompt: "write about AI" }` → `{ status: "generating" }` → blog handler runs
5. `system_create { entityType: "deck", prompt: "conference talk" }` → deck handler runs
6. `system_list`, `system_get`, `system_search` unchanged
