# Plan: Generic `system_set-cover` Tool with Adapter Capabilities

## Goal

Enable setting cover images on any entity type that supports it, without hardcoding entity types. Use adapter-based capability discovery.

## Approach: Option B - Extend EntityAdapter with Optional Methods

Adapters declare AND implement cover image support via optional methods. The system plugin checks if an adapter has these methods before calling them.

## Implementation Steps

### Phase 1: Extend EntityAdapter Interface

**File:** `shell/entity-service/src/types.ts`

Add optional cover image methods to `EntityAdapter`:

```typescript
export interface EntityAdapter<TEntity, TMetadata> {
  // ... existing methods

  /** Optional: Get cover image ID from entity (if supported) */
  getCoverImageId?(entity: TEntity): string | null;

  /** Optional: Set cover image ID on entity, returns updated entity (if supported) */
  setCoverImageId?(entity: TEntity, imageId: string | null): TEntity;
}
```

### Phase 2: Add Shared Frontmatter Utility

**File:** `shared/utils/src/markdown.ts`

Add helper for updating frontmatter fields:

```typescript
export function updateFrontmatterField(
  markdown: string,
  field: string,
  value: unknown,
): string {
  const { frontmatter, content } = parseMarkdown(markdown);
  if (value === null || value === undefined) {
    delete frontmatter[field];
  } else {
    frontmatter[field] = value;
  }
  return generateMarkdown(frontmatter, content);
}
```

### Phase 3: Implement in Blog Adapter

**File:** `plugins/blog/src/adapters/blog-post-adapter.ts`

Add cover image methods:

```typescript
getCoverImageId(entity: BlogPost): string | null {
  const { frontmatter } = parseMarkdown(entity.content);
  return (frontmatter.coverImageId as string) ?? null;
}

setCoverImageId(entity: BlogPost, imageId: string | null): BlogPost {
  const updatedContent = updateFrontmatterField(
    entity.content,
    'coverImageId',
    imageId,
  );
  return { ...entity, content: updatedContent };
}
```

### Phase 4: Expose updateEntity in System Plugin

**File:** `plugins/system/src/types.ts`

Add to ISystemPlugin:

```typescript
updateEntity<T extends BaseEntity>(entity: T): Promise<{ entityId: string; jobId: string }>;
```

**File:** `plugins/system/src/plugin.ts`

Implement by delegating to context.entityService.updateEntity()

### Phase 5: Create system_set-cover Tool

**File:** `plugins/system/src/tools/image-tools.ts`

Add new tool:

```typescript
const setCoverInputSchema = z.object({
  entityType: z.string().describe("Entity type (e.g., 'blog', 'deck')"),
  entityId: z.string().describe("Entity ID or slug"),
  imageId: z
    .string()
    .nullable()
    .describe("Image ID to set as cover, or null to remove"),
});

function createSetCoverTool(
  plugin: ISystemPlugin,
  pluginId: string,
): PluginTool {
  return {
    name: `${pluginId}_set-cover`,
    description: "Set or remove cover image on an entity that supports it",
    inputSchema: setCoverInputSchema.shape,
    handler: async (input, _toolContext) => {
      const { entityType, entityId, imageId } =
        setCoverInputSchema.parse(input);

      // Get adapter and check capability
      const adapter = plugin.getAdapter(entityType);
      if (!adapter?.setCoverImageId) {
        return {
          status: "error",
          message: `Entity type '${entityType}' doesn't support cover images`,
        };
      }

      // Get entity
      const entity = await plugin.findEntity(entityType, entityId);
      if (!entity) {
        return { status: "error", message: `Entity not found: ${entityId}` };
      }

      // Validate image exists (if setting, not removing)
      if (imageId) {
        const image = await plugin.getEntity("image", imageId);
        if (!image) {
          return { status: "error", message: `Image not found: ${imageId}` };
        }
      }

      // Update entity
      const updated = adapter.setCoverImageId(entity, imageId);
      await plugin.updateEntity(updated);

      return {
        status: "success",
        message: imageId
          ? `Cover image set to '${imageId}'`
          : "Cover image removed",
      };
    },
  };
}
```

### Phase 6: Expose getAdapter in System Plugin

Need to expose adapter access so the tool can check capabilities.

**File:** `shell/plugins/src/interfaces.ts` - Add to IShell
**File:** `shell/plugins/src/service/context.ts` - Add to ServicePluginContext
**File:** `plugins/system/src/types.ts` - Add to ISystemPlugin

## Files to Modify

| File                                             | Change                                      |
| ------------------------------------------------ | ------------------------------------------- |
| `shell/entity-service/src/types.ts`              | Add optional cover methods to EntityAdapter |
| `shared/utils/src/markdown.ts`                   | Add updateFrontmatterField helper           |
| `shared/utils/src/index.ts`                      | Export new function                         |
| `plugins/blog/src/adapters/blog-post-adapter.ts` | Implement cover methods                     |
| `shell/plugins/src/interfaces.ts`                | Add getAdapter, updateEntity to IShell      |
| `shell/plugins/src/service/context.ts`           | Add to ServicePluginContext                 |
| `shell/plugins/src/test/mock-shell.ts`           | Add mock methods                            |
| `shell/core/src/shell.ts`                        | Implement getAdapter, updateEntity          |
| `plugins/system/src/types.ts`                    | Add to ISystemPlugin                        |
| `plugins/system/src/plugin.ts`                   | Implement methods                           |
| `plugins/system/src/tools/image-tools.ts`        | Add system_set-cover tool                   |
| `plugins/system/test/plugin.test.ts`             | Update expected tool count                  |

## Future: Add to Other Entity Types

Once blog works, same pattern for:

- `plugins/decks/src/formatters/deck-formatter.ts` (or adapter)
- `plugins/blog/src/services/series-manager.ts` (for series)

## Testing

1. Unit test for updateFrontmatterField
2. Unit test for blog adapter cover methods
3. Integration test for system_set-cover tool
4. Test error cases: unsupported entity type, missing entity, missing image
