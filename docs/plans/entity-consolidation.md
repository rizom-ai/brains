# Plan: Entity Consolidation

## Context

Several plugins that manage entity types are still ServicePlugins — they use the ServicePlugin base class even though their primary concern is defining an entity type with event-driven derivation or generation. This plan migrates them to EntityPlugin, adds the `derive()` pattern for event-driven entities, and consolidates extraction into `system_extract`.

This plan works entirely within the current plugin system. No class hierarchy changes, no new plugin types, no context refactors.

## Design

### derive() on EntityPlugin

Some entity types are automatically maintained in response to events — not created by users. `derive()` is an optional method on EntityPlugin for this pattern.

```typescript
export class TopicPlugin extends EntityPlugin<Topic> {
  readonly entityType = "topic";
  readonly schema = topicSchema;
  readonly adapter = topicAdapter;
  readonly derivedFrom = ["post", "link"];

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
    source: BaseEntity,
    event: DeriveEvent,
    context: EntityPluginContext,
  ): Promise<void> {
    // Extract topics from source content, create/merge topic entities
  }
}
```

The plugin subscribes to events in `onRegister()` and calls `derive()` itself — no magic auto-wiring. The method exists for:

- **Convention**: signals this is a derived entity
- **Testability**: call `derive()` directly in tests without firing events
- **Manual trigger**: `system_extract` calls `derive()` for batch reprocessing

### derivedFrom — source type declaration

EntityPlugins with `derive()` declare which source entity types they watch:

```typescript
readonly derivedFrom = ["post", "link"];  // topics
readonly derivedFrom = ["post", "deck"];  // series
readonly derivedFrom = ["post", "deck", "project"];  // image (cover generation)
```

`system_extract` uses `derivedFrom` to find which plugins to invoke for a given source type. This is the only place `derivedFrom` is used — event subscriptions are still wired manually in `onRegister()`.

### Derived entity plugins

| Plugin       | derivedFrom                   | Subscribes to                                                        | What derive() does                                     |
| ------------ | ----------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------ |
| topics       | `["post", "link"]`            | `entity:created`, `entity:updated` for posts/links                   | Extract topics, create/merge topic entities            |
| series       | `["post", "deck"]`            | `entity:created`, `entity:updated`, `entity:deleted` for posts/decks | Group by `seriesName`, auto-create/delete series       |
| summary      | —                             | `conversation:digest`                                                | Update summary from conversation digest                |
| link         | —                             | `conversation:message`                                               | Detect URLs in messages, auto-capture as link entities |
| social-media | `["post"]`                    | `entity:created` for posts                                           | Auto-generate social posts from new blog content       |
| image        | `["post", "deck", "project"]` | `entity:created` for posts/decks/projects                            | Auto-generate cover image for entities that lack one   |

Summary and link derive from non-entity events (conversations), so they have no `derivedFrom` — `system_extract` doesn't apply to them. They use `derive()` for event-driven updates and `createGenerationHandler()` for user-triggered creation.

Some plugins have both `derive()` (event-driven) and `createGenerationHandler()` (user-triggered):

- **Link**: derive() auto-captures URLs from conversations + generation handler for explicit "capture this URL"
- **Summary**: derive() auto-updates on conversation digest + generation handler for "summarize my conversations"
- **Social-media**: derive() auto-generates social posts from new content + generation handler for explicit "create a post about X"
- **Image**: derive() auto-generates cover images for new content + generation handler for explicit "generate an image for X"

### system_extract tool

Operates on **source entity types**, not derived types. One call triggers all plugins that derive from that source:

```
system_extract { entityType: "post" }
  → topics: extract topics from all posts
  → series: sync series from all posts
  → image: generate missing covers for all posts
  → social-media: generate social posts from all posts

system_extract { entityType: "post", source: "post-123" }
  → same plugins, but only for post-123

system_extract { entityType: "link" }
  → topics: extract topics from all links
```

Routing: system finds all EntityPlugins where `derivedFrom` includes the given entity type. For single-source, calls `derive(source)` on each. For batch, calls `deriveAll(context)` on each.

Summary and link are not triggered by `system_extract` — they derive from conversations, not entities. They're triggered by their own events or by `system_create`.

### summary_get tool

`summary_get` looks up a summary by conversationId — a domain-specific query, not derivation. It stays as-is. It is not replaced by `system_extract`.

### Image as EntityPlugin

Image is currently a ServicePlugin but it defines an entity type (image) with a schema and adapter. The entity registration currently lives in `shellInitializer` — it should move into the plugin.

Current image tools:

- `image_generate` — AI generates image, creates entity → becomes a **generation handler** via `system_create { entityType: "image" }`
- `image_upload` — creates image entity from URL/data URL → uses existing `system_create` direct creation path (content provided, no generation needed)
- `image_set-cover` — sets cover image on any entity type → moves to **system plugin** (cross-entity operation)

After migration, image becomes a clean EntityPlugin with `derive()` (auto-generate covers) and a generation handler (explicit "generate an image"). Zero tools. AI access for handlers is obtained during `onRegister()` as a stored dependency.

### Migration map

| Plugin       | Currently     | Becomes                                        | Notes                                            |
| ------------ | ------------- | ---------------------------------------------- | ------------------------------------------------ |
| series       | Part of blog  | EntityPlugin (with derive + derivedFrom)       | Extracted from blog, see simplify-series plan    |
| topics       | ServicePlugin | EntityPlugin (with derive + derivedFrom)       | batch-extract tool → system_extract              |
| summary      | ServicePlugin | EntityPlugin (with derive + generation)        | summary_get tool stays (domain-specific lookup)  |
| social-media | ServicePlugin | EntityPlugin (with derive + derivedFrom)       | Zero tools today, just subscriptions             |
| image        | ServicePlugin | EntityPlugin (with derive + derivedFrom + gen) | Entity registration moves from shell into plugin |

### What gets deleted

- `topics_batch-extract` tool (replaced by `system_extract`)
- `image_upload` tool (replaced by `system_create` direct creation)
- `image_generate` tool (replaced by `system_create` with `image:generation` handler)
- `image_set-cover` tool (moves to system plugin as `system_set-cover`)
- Image entity registration in `shellInitializer`

### What gets added

- `derivedFrom` optional property on EntityPlugin
- `system_extract` routing by source type (finds plugins via `derivedFrom`)
- `system_set-cover` tool in system plugin (from image)
- `entities/series/` — new EntityPlugin with derive() (see simplify-series plan)
- `entities/image/` — image as EntityPlugin (moved from plugins/image)

## Steps

### Phase 1: derive() + derivedFrom + system_extract

Foundation for derived entities.

1. Add optional `derive()`, `deriveAll()`, and `derivedFrom` to EntityPlugin
2. Update `system_extract` to route by source type — find plugins where `derivedFrom` includes entityType
3. For single source: fetch entity, call `derive(source)` on each matching plugin
4. For batch: call `deriveAll(context)` on each matching plugin
5. Tests

### Phase 2: Extract series from blog

Validates derive() with the simplest case. See simplify-series plan for full details.

1. Create `entities/series/` EntityPlugin with derive() + derivedFrom
2. Move series schema, adapter, datasource, templates, routes from blog
3. Series subscribes to entity events in onRegister(), calls derive()
4. Blog becomes single-entity EntityPlugin (post only)
5. Update brain model registrations
6. Tests

### Phase 3: Migrate topics + summary + social-media

Convert ServicePlugins to EntityPlugins with derive().

1. Topics: move to `entities/topics/`, remove batch-extract tool, add derive() + derivedFrom, subscribe to entity events
2. Summary: move to `entities/summary/`, keep summary_get as-is, add derive(), subscribe to conversation events (no derivedFrom — conversation-driven)
3. Social-media: move to `entities/social-media/`, add derive() + derivedFrom for auto-generation from new posts
4. All three keep generation handlers for system_create
5. Tests

### Phase 4: Migrate image

1. Move to `entities/image/`
2. Remove image entity registration from shellInitializer
3. Add derivedFrom for posts/decks/projects
4. Add derive() — auto-generate cover image for entities that lack one
5. Convert `image_generate` → `image:generation` handler (store AI dependency in onRegister)
6. Remove `image_upload` tool — use `system_create` with direct content
7. Move `image_set-cover` → `system_set-cover` in system plugin
8. Update brain model registrations
9. Tests

## Verification

1. `bun test` — all tests pass
2. `bun run typecheck` / `bun run lint`
3. Each migrated plugin registers correctly as EntityPlugin
4. `system_create` still routes to correct generation handlers
5. `system_create { entityType: "image" }` generates images via AI
6. `system_create` with image content creates images directly (upload path)
7. `system_extract { entityType: "post" }` triggers topics, series, image, social-media derivation
8. `system_extract { entityType: "post", source: "post-123" }` triggers derivation for one post
9. `system_extract { entityType: "link" }` triggers only topics derivation
10. `system_set-cover` works for all entity types with cover image support
11. Series auto-derive from posts/decks via derive()
12. Topics extract via derive() on entity changes
13. Image auto-generates covers via derive() on new content
14. Summary updates via derive() on conversation digest
15. Social posts auto-generate via derive() on new blog content
16. Site builds still work
17. summary_get tool still works
