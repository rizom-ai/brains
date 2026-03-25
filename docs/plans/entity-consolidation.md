# Plan: Entity Consolidation

## Context

Several plugins that manage entity types are still ServicePlugins — they use the ServicePlugin base class even though their primary concern is defining an entity type with event-driven derivation or generation. This plan migrates them to EntityPlugin, adds the `derive()` pattern for event-driven entities, and consolidates entity-related tools into `system_extract`.

This plan works entirely within the current plugin system. No class hierarchy changes, no new plugin types, no context refactors.

## Design

### derive() on EntityPlugin

Some entity types are automatically maintained in response to events — not created by users. `derive()` is an optional method on EntityPlugin for this pattern.

```typescript
export class TopicPlugin extends EntityPlugin<Topic> {
  readonly entityType = "topic";
  readonly schema = topicSchema;
  readonly adapter = topicAdapter;

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    context.messaging.subscribe("entity:created", (msg) => {
      if (["post", "link"].includes(msg.payload.entityType)) {
        this.derive(msg.payload.entity, "created", context);
      }
    });
  }

  protected async derive(
    source: unknown,
    event: string,
    context: EntityPluginContext,
  ): Promise<void> {
    // Extract topics from source content, create/merge topic entities
  }
}
```

No magic auto-wiring. The plugin subscribes to whatever events it needs in `onRegister()` and calls `derive()` itself. The method exists for:

- **Convention**: signals this is a derived entity
- **Testability**: call `derive()` directly in tests without firing events
- **Manual trigger**: `system_extract` calls `derive()` for batch reprocessing

#### Derived entity plugins

| Plugin       | Subscribes to                                                        | What derive() does                                     |
| ------------ | -------------------------------------------------------------------- | ------------------------------------------------------ |
| topics       | `entity:created`, `entity:updated` for posts/links                   | Extract topics, create/merge topic entities            |
| series       | `entity:created`, `entity:updated`, `entity:deleted` for posts/decks | Group by `seriesName`, auto-create/delete series       |
| summary      | `conversation:digest`                                                | Update summary from conversation digest                |
| link         | `conversation:message`                                               | Detect URLs in messages, auto-capture as link entities |
| social-media | `entity:created` for posts                                           | Auto-generate social posts from new blog content       |

Some plugins have both `derive()` (event-driven) and `createGenerationHandler()` (user-triggered):

- **Link**: derive() auto-captures URLs from conversations + generation handler for explicit "capture this URL"
- **Summary**: derive() auto-updates on conversation digest + generation handler for "summarize my conversations"
- **Social-media**: derive() auto-generates social posts from new content + generation handler for explicit "create a post about X"

### system_extract tool

One tool in the system plugin for manual/batch derivation:

```
system_extract { entityType: "topic" }                          → extract all
system_extract { entityType: "topic", source: "post-123" }      → extract from one
system_extract { entityType: "series" }                          → resync all series
system_extract { entityType: "summary" }                         → regenerate summary
```

Routes to the EntityPlugin's `derive()` method via `{entityType}:extract` handler convention. Same routing pattern as `system_create` → `{entityType}:generation`.

### summary_get tool

`summary_get` looks up a summary by conversationId — a domain-specific query, not derivation. It stays as-is. It is not replaced by `system_extract`.

### Image as EntityPlugin

Image is currently a ServicePlugin but it defines an entity type (image) with a schema and adapter. The entity registration currently lives in `shellInitializer` — it should move into the plugin.

Current image tools:

- `image_generate` — AI generates image, creates entity → becomes a **generation handler** via `system_create { entityType: "image" }`
- `image_upload` — creates image entity from URL/data URL → uses existing `system_create` direct creation path (content provided, no generation needed)
- `image_set-cover` — sets cover image on any entity type → moves to **system plugin** (cross-entity operation)

After migration, image becomes a clean EntityPlugin with zero tools. AI access for the generation handler is obtained during `onRegister()` as a stored dependency, not through the plugin context.

### Migration map

| Plugin       | Currently     | Becomes                                   | Notes                                            |
| ------------ | ------------- | ----------------------------------------- | ------------------------------------------------ |
| series       | Part of blog  | EntityPlugin (new, with derive())         | Extracted from blog, see simplify-series plan    |
| topics       | ServicePlugin | EntityPlugin (with derive())              | batch-extract tool → system_extract              |
| summary      | ServicePlugin | EntityPlugin (with derive() + generation) | summary_get tool stays (domain-specific lookup)  |
| social-media | ServicePlugin | EntityPlugin (with derive() + generation) | Zero tools today, just subscriptions             |
| image        | ServicePlugin | EntityPlugin (with generation handler)    | Entity registration moves from shell into plugin |

### What gets deleted

- `topics_batch-extract` tool (replaced by `system_extract`)
- `image_upload` tool (replaced by `system_create` direct creation)
- `image_generate` tool (replaced by `system_create` with `image:generation` handler)
- `image_set-cover` tool (moves to system plugin as `system_set-cover`)
- Image entity registration in `shellInitializer`

### What gets added

- `derive()` optional method on EntityPlugin
- `system_extract` tool in system plugin
- `system_set-cover` tool in system plugin (from image)
- `entities/series/` — new EntityPlugin with derive() (see simplify-series plan)
- `entities/image/` — image as EntityPlugin (moved from plugins/image)

## Steps

### Phase 1: derive() + system_extract

Foundation for derived entities.

1. Add optional `derive()` method to EntityPlugin
2. Add `system_extract` tool to system plugin
3. Route to EntityPlugin's derive() via `{entityType}:extract` handler convention
4. Tests

### Phase 2: Extract series from blog

Validates derive() with the simplest case. See simplify-series plan for full details.

1. Create `entities/series/` EntityPlugin with derive()
2. Move series schema, adapter, datasource, templates, routes from blog
3. Series subscribes to entity events in onRegister(), calls derive()
4. Blog becomes single-entity EntityPlugin (post only)
5. Update brain model registrations
6. Tests

### Phase 3: Migrate topics + summary + social-media

Convert ServicePlugins to EntityPlugins with derive().

1. Topics: move to `entities/topics/`, remove batch-extract tool, add derive(), subscribe to entity events
2. Summary: move to `entities/summary/`, keep summary_get as-is, add derive(), subscribe to conversation events
3. Social-media: move to `entities/social-media/`, add derive() for auto-generation from new posts
4. All three keep generation handlers for system_create
5. Tests

### Phase 4: Migrate image

1. Move to `entities/image/`
2. Remove image entity registration from shellInitializer
3. Convert `image_generate` → `image:generation` handler (store AI dependency in onRegister)
4. Remove `image_upload` tool — use `system_create` with direct content
5. Move `image_set-cover` → `system_set-cover` in system plugin
6. Update brain model registrations
7. Tests

## Verification

1. `bun test` — all tests pass
2. `bun run typecheck` / `bun run lint`
3. Each migrated plugin registers correctly as EntityPlugin
4. `system_create` still routes to correct generation handlers
5. `system_create { entityType: "image" }` generates images via AI
6. `system_create` with image content creates images directly (upload path)
7. `system_extract` routes to correct derive() methods
8. `system_set-cover` works for all entity types with cover image support
9. Series auto-derive from posts/decks via derive()
10. Topics extract via derive() on entity changes
11. Summary updates via derive() on conversation digest
12. Social posts auto-generate via derive() on new blog content
13. Site builds still work
14. summary_get tool still works
