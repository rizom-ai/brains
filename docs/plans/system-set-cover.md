# Plan: Generic `system_set-cover` Tool with Adapter Capabilities

## Goal

Enable setting cover images on any entity type that supports it, without hardcoding entity types. Use adapter-based capability discovery.

## Approach: Capability Flag + Generic Utility

Adapters declare cover image support via a simple boolean flag. A shared utility handles the actual get/set logic since all entity types store `coverImageId` the same way (in frontmatter).

## Implementation Steps

### Phase 1: Add Capability Flag to EntityAdapter

**File:** `shell/entity-service/src/types.ts`

Add optional capability flag to `EntityAdapter`:

```typescript
export interface EntityAdapter<TEntity, TMetadata> {
  // ... existing methods

  /** Optional: Declares that this entity type supports cover images via coverImageId in frontmatter */
  supportsCoverImage?: boolean;
}
```

### Phase 2: Add Shared Utilities

**File:** `shared/utils/src/markdown.ts`

Add helpers for frontmatter field updates and cover image operations:

```typescript
/**
 * Update a single field in frontmatter, preserving all other fields
 */
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

/**
 * Get cover image ID from any entity that stores it in frontmatter
 */
export function getCoverImageId(entity: { content: string }): string | null {
  const { frontmatter } = parseMarkdown(entity.content);
  return (frontmatter.coverImageId as string) ?? null;
}

/**
 * Set cover image ID on any entity, returns new entity with updated content
 */
export function setCoverImageId<T extends { content: string }>(
  entity: T,
  imageId: string | null,
): T {
  const updatedContent = updateFrontmatterField(
    entity.content,
    "coverImageId",
    imageId,
  );
  return { ...entity, content: updatedContent };
}
```

### Phase 3: Enable in Adapters

Both blog posts and portfolio projects already have `coverImageId` in their schemas. Just set the capability flag.

**File:** `plugins/blog/src/adapters/blog-post-adapter.ts`

```typescript
export const blogPostAdapter: EntityAdapter<BlogPost, BlogPostMetadata> = {
  entityType: "blog",
  supportsCoverImage: true, // Add this line
  // ... rest unchanged
};
```

**File:** `plugins/portfolio/src/adapters/project-adapter.ts`

```typescript
export const projectAdapter: EntityAdapter<Project, ProjectMetadata> = {
  entityType: "project",
  supportsCoverImage: true, // Add this line
  // ... rest unchanged
};
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
import { setCoverImageId } from "@brains/utils";

const setCoverInputSchema = z.object({
  entityType: z.string().describe("Entity type (e.g., 'blog', 'project')"),
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
      if (!adapter?.supportsCoverImage) {
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

      // Update entity using shared utility
      const updated = setCoverImageId(entity, imageId);
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

| File                                                | Change                                         |
| --------------------------------------------------- | ---------------------------------------------- |
| `shell/entity-service/src/types.ts`                 | Add `supportsCoverImage` flag to EntityAdapter |
| `shared/utils/src/markdown.ts`                      | Add utility functions                          |
| `shared/utils/src/index.ts`                         | Export new functions                           |
| `plugins/blog/src/adapters/blog-post-adapter.ts`    | Set `supportsCoverImage: true`                 |
| `plugins/portfolio/src/adapters/project-adapter.ts` | Set `supportsCoverImage: true`                 |
| `shell/plugins/src/interfaces.ts`                   | Add getAdapter, updateEntity to IShell         |
| `shell/plugins/src/service/context.ts`              | Add to ServicePluginContext                    |
| `shell/plugins/src/test/mock-shell.ts`              | Add mock methods                               |
| `shell/core/src/shell.ts`                           | Implement getAdapter, updateEntity             |
| `plugins/system/src/types.ts`                       | Add to ISystemPlugin                           |
| `plugins/system/src/plugin.ts`                      | Implement methods                              |
| `plugins/system/src/tools/image-tools.ts`           | Add system_set-cover tool                      |
| `plugins/system/test/plugin.test.ts`                | Update expected tool count                     |

## Future: Add to Other Entity Types

Just set `supportsCoverImage: true` on any adapter - no code duplication needed:

- `plugins/decks/src/formatters/deck-formatter.ts` - for deck covers
- `plugins/blog/src/services/series-manager.ts` - for series covers

## Testing

1. Unit tests for shared utilities (`updateFrontmatterField`, `getCoverImageId`, `setCoverImageId`)
2. Integration test for system_set-cover tool
3. Test error cases: unsupported entity type, missing entity, missing image
