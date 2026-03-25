# Plan: Entity Consolidation

## Context

Several plugins that manage entity types are still ServicePlugins — they use the ServicePlugin base class even though their primary concern is defining an entity type with event-driven derivation or generation. This plan migrates them to EntityPlugin, adds the `derive()` pattern for event-driven entities, and uses `system_extract` for batch enrichment.

This plan works entirely within the current plugin system. No class hierarchy changes, no new plugin types, no context refactors.

## Design

### derive() and deriveAll() on EntityPlugin

`derive()` and `deriveAll()` are optional methods on EntityPlugin for two purposes:

1. **Event-driven derivation**: plugins subscribe to events in `onRegister()` and call `derive()` to create/update derived entities (e.g. topics extracted from posts, series grouped from posts).
2. **Self-enrichment**: `deriveAll()` fills in missing derived fields on the entity type's own entities (e.g. generating missing descriptions or queueing missing cover images).

```typescript
export class TopicPlugin extends EntityPlugin<Topic> {
  readonly entityType = "topic";
  readonly schema = topicSchema;
  readonly adapter = topicAdapter;

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    // Event-driven: extract topics when posts change
    context.messaging.subscribe("entity:created", (msg) => {
      if (["post", "link"].includes(msg.payload.entityType)) {
        this.derive(msg.payload.entity, "created", context);
      }
    });
  }

  // Single entity derivation
  public override async derive(
    source: BaseEntity,
    event: string,
    context: EntityPluginContext,
  ): Promise<void> {
    // Extract topics from source content, create/merge topic entities
  }

  // Batch enrichment: re-extract all topics from all sources
  public override async deriveAll(context: EntityPluginContext): Promise<void> {
    // List all source entities, extract topics from each
  }
}
```

No magic auto-wiring. The plugin subscribes to whatever events it needs and calls `derive()` itself. The methods exist for:

- **Convention**: signals this entity type has derived data
- **Testability**: call `derive()` directly in tests without firing events
- **Manual trigger**: `system_extract` calls `deriveAll()` for batch enrichment

### system_extract tool

Operates on a **specific entity type**. Calls that type's `{entityType}:extract` handler, which triggers `deriveAll()` to fill in missing derived data.

```
system_extract { entityType: "post" }
  → post:extract handler → generate missing cover images for all posts

system_extract { entityType: "series" }
  → series:extract handler → sync series, generate missing descriptions

system_extract { entityType: "topic" }
  → topic:extract handler → re-extract topics from all source entities

system_extract { entityType: "series", source: "eco-arch" }
  → series:extract handler → enrich single series entity
```

Each entity type's extract handler knows what "enrichment" means for that type:

- **post**: generate missing cover images
- **series**: sync from entities with seriesName, generate missing descriptions, queue missing cover images
- **topic**: re-extract from source entities (posts, links)
- **social-post**: re-generate from source posts
- **image**: no extract (images are always explicitly created)

No cross-plugin routing needed. No `derivedFrom` property. Each handler is self-contained.

### Derived entity plugins

| Plugin       | Subscribes to                                                     | What derive() does                                     | What deriveAll() does                           |
| ------------ | ----------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------- |
| topics       | `entity:created`, `entity:updated` for posts/links                | Extract topics from one source entity                  | Re-extract topics from all source entities      |
| series       | `entity:created`, `entity:updated`, `entity:deleted` for any type | Ensure series exists for entity's seriesName           | Sync all series, generate missing descriptions  |
| summary      | `conversation:digest`                                             | Update summary from conversation digest                | —                                               |
| social-media | `entity:updated` for published posts                              | Auto-generate social post from newly published content | Re-generate missing social posts from all posts |

Some plugins have both `derive()` (event-driven) and `createGenerationHandler()` (user-triggered):

- **Summary**: derive() auto-updates on conversation digest + generation handler for "summarize my conversations"
- **Social-media**: derive() auto-generates from new content + generation handler for "create a post about X"

### summary_get tool

`summary_get` looks up a summary by conversationId — a domain-specific query, not extraction. It stays as-is.

### Image as EntityPlugin

Image is currently a ServicePlugin but defines an entity type (image) with a schema and adapter. The entity registration currently lives in `shellInitializer` — it should move into the plugin.

Current image tools:

- `image_generate` — AI generates image, creates entity → becomes a **generation handler** via `system_create { entityType: "image" }`
- `image_upload` — creates image entity from URL/data URL → uses existing `system_create` direct creation path (content provided, no generation needed)
- `image_set-cover` — sets cover image on any entity type → moves to **system plugin** (cross-entity operation)

After migration, image becomes a clean EntityPlugin with a generation handler. Zero tools. Cover image generation is agent-driven — the agent uses `system_create { entityType: "image" }` and `system_set-cover` as needed.

### Migration map

| Plugin       | Currently     | Becomes                          | Notes                                            |
| ------------ | ------------- | -------------------------------- | ------------------------------------------------ |
| series       | Part of blog  | EntityPlugin (with derive)       | ✅ Done — extracted from blog                    |
| topics       | ServicePlugin | EntityPlugin (with derive)       | batch-extract tool → system_extract              |
| summary      | ServicePlugin | EntityPlugin (with derive + gen) | summary_get tool stays (domain-specific lookup)  |
| social-media | ServicePlugin | EntityPlugin (with derive + gen) | Zero tools today, just subscriptions             |
| image        | ServicePlugin | EntityPlugin (with generation)   | Entity registration moves from shell into plugin |

### What gets deleted

- `topics_batch-extract` tool (replaced by `system_extract`)
- `image_upload` tool (replaced by `system_create` direct creation)
- `image_generate` tool (replaced by `system_create` with `image:generation` handler)
- `image_set-cover` tool (moves to system plugin as `system_set-cover`)
- Image entity registration in `shellInitializer`

### What gets added

- `system_set-cover` tool in system plugin (from image)
- `entities/series/` — ✅ Done
- `entities/image/` — image as EntityPlugin (moved from plugins/image)

## Steps

### Phase 1: derive() + system_extract ✅

Foundation for derived entities.

1. ✅ Add optional `derive()`, `deriveAll()`, `hasDeriveHandler()` to EntityPlugin
2. ✅ Auto-register `{entityType}:extract` handler when `hasDeriveHandler()` is true
3. ✅ Add `system_extract` tool to system plugin
4. ✅ Tests

### Phase 2: Extract series from blog ✅

1. ✅ Create `entities/series/` EntityPlugin with derive() + deriveAll()
2. ✅ Series schema, adapter, datasource, templates, generation handler
3. ✅ Cross-content: watches entity events across all types with seriesName
4. ✅ Blog unchanged (already single-entity EntityPlugin)
5. ✅ Registered in rover brain model
6. ✅ Tests

### Phase 3: Migrate topics + summary + social-media

Convert ServicePlugins to EntityPlugins with derive().

1. Topics: move to `entities/topics/`, remove batch-extract tool, add derive() + deriveAll(), subscribe to entity events
2. Summary: move to `entities/summary/`, keep summary_get as-is, add derive(), subscribe to conversation events
3. Social-media: move to `entities/social-media/`, add derive() + deriveAll() for auto-generation from published posts
4. All three keep generation handlers for system_create
5. Tests

### Phase 4: Migrate image

1. Move to `entities/image/`
2. Remove image entity registration from shellInitializer
3. Convert `image_generate` → `image:generation` handler
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
7. `system_extract { entityType: "post" }` generates missing cover images for posts
8. `system_extract { entityType: "series" }` syncs series + generates missing descriptions
9. `system_extract { entityType: "topic" }` re-extracts topics from source entities
10. `system_set-cover` works for all entity types with cover image support
11. Series auto-derive from posts/decks via derive()
12. Topics extract via derive() on entity changes
13. Summary updates via derive() on conversation digest
14. Social posts auto-generate via derive() on published posts
15. Site builds still work
16. summary_get tool still works
