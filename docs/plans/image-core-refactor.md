# Plan: Refactor Image from Plugin to Core Capability

## Goal

Make image support a core capability so `entity://image/{id}` references work automatically in ALL markdown content, not just blog posts.

## Current State

- `@brains/image` is a plugin in `plugins/image/`
- `ImageReferenceResolver` lives in blog plugin, only resolves for blog posts
- `MarkdownImageConverter` in directory-sync converts HTTP URLs to entity refs
- Other entity types (notes, decks) cannot use inline images

## Target State

- Image utilities and entity type registration in core/shared
- Entity-service automatically resolves `entity://image/{id}` in any entity's content
- All markdown content supports inline images transparently
- No image plugin needed - just core functionality

---

## Implementation Steps

### Phase 1: Move Image Utilities to Shared Package

**Files to modify:**

- `shared/image/` (new package, renamed from `plugins/image/`)
- `shared/image/package.json` - rename to `@brains/image` (keep name, change location)

**Changes:**

1. Move `plugins/image/` to `shared/image/`
2. Remove plugin class (`ImagePlugin`), keep only:
   - Schemas (`imageSchema`, `imageMetadataSchema`, etc.)
   - Adapter (`ImageAdapter`)
   - Utilities (`parseDataUrl`, `detectImageFormat`, etc.)
   - Resolver (`resolveImage`)
3. Export everything needed for core registration

**Files to keep:**

- `src/schemas/image.ts` - schemas
- `src/adapters/image-adapter.ts` - adapter
- `src/lib/image-utils.ts` - utilities
- `src/lib/image-resolver.ts` - resolveImage utility

**Files to remove:**

- `src/plugin.ts` - no longer a plugin
- `src/tools/` - tools move to a different location (see Phase 4)
- `src/config.ts` - config moves to core

---

### Phase 2: Move ImageReferenceResolver to Entity-Service

**Files to modify:**

- `shell/entity-service/src/lib/content-resolver.ts` (new)
- `shell/entity-service/src/entity-serializer.ts`
- `shell/entity-service/src/types.ts`

**Changes:**

1. Create `ContentResolver` class in entity-service:

```typescript
// shell/entity-service/src/lib/content-resolver.ts
export class ContentResolver {
  constructor(
    private entityService: IEntityService,
    private logger: Logger,
  ) {}

  async resolveImageReferences(content: string): Promise<string> {
    // Move logic from ImageReferenceResolver
    // Detect entity://image/{id} patterns
    // Batch fetch images
    // Replace with data URLs
  }
}
```

2. Add resolution hook in `EntitySerializer.convertToEntity()`:

```typescript
// After deserialization, before returning
if (entity.content && typeof entity.content === "string") {
  entity.content = await this.contentResolver.resolveImageReferences(
    entity.content,
  );
}
```

3. Make resolution opt-out per entity type:

```typescript
// In entity adapter metadata or schema
interface EntityAdapterOptions {
  resolveImageReferences?: boolean; // default: true, entity types can opt out
}
```

Entity types like `image` itself should opt out (no need to resolve refs in image metadata).
Most content types (post, note, deck) resolve by default.

---

### Phase 3: Register Image Entity Type in Core

**Files to modify:**

- `shell/core/src/shell.ts` or new `shell/core/src/builtin-entities.ts`
- `shell/entity-service/src/entity-registry.ts`

**Changes:**

1. Create builtin entity registration:

```typescript
// shell/core/src/builtin-entities.ts
import { imageSchema, imageAdapter } from "@brains/image";

export function registerBuiltinEntities(entityService: IEntityService) {
  entityService.registerEntityType("image", imageSchema, imageAdapter);
}
```

2. Call during shell initialization (before plugins load)

---

### Phase 4: Move Image Tools to Systems Plugin

**Decision:** Add image tools to the existing systems plugin

**Files to modify:**

- `plugins/systems/src/tools/` - add image tools here
- `plugins/systems/src/index.ts` - export new tools

**Tools to move:**

- `image_upload` - upload/create image entities
- `image_get` - retrieve image by ID
- `image_list` - list all images

---

### Phase 5: Update Dependents

**Files to modify:**

- `plugins/directory-sync/` - update imports from `@brains/image`
- `plugins/blog/` - remove `ImageReferenceResolver` usage (now automatic)
- `apps/professional-brain/brain.config.ts` - remove `imagePlugin()`

**Changes in blog plugin:**

1. Remove `ImageReferenceResolver` import and usage
2. Remove `imageResolver` from `BlogDataSource` constructor
3. Remove `resolvePostInlineImages` helper
4. Content resolution now happens automatically in entity-service

**Changes in directory-sync:**

- Imports should still work (same package name, just moved)

---

## File Summary

### New Files

- `shell/entity-service/src/lib/content-resolver.ts`
- `shell/core/src/builtin-entities.ts`
- `plugins/systems/src/tools/image-*.ts` (image tools in systems plugin)

### Moved Files

- `plugins/image/` → `shared/image/`

### Deleted Files

- `plugins/image/src/plugin.ts`
- `plugins/image/src/tools/`
- `plugins/image/src/config.ts`
- `plugins/blog/src/lib/image-reference-resolver.ts`

### Modified Files

- `shell/entity-service/src/entity-serializer.ts` - add resolution hook
- `shell/core/src/shell.ts` - register builtin entities
- `plugins/blog/src/datasources/blog-datasource.ts` - remove resolver
- `plugins/blog/src/plugin.ts` - remove resolver setup
- `apps/professional-brain/brain.config.ts` - remove imagePlugin

---

## Migration Path

1. Move package first (plugins/image → shared/image)
2. Add content resolution to entity-service (with opt-out per type)
3. Register image as builtin entity type
4. Update blog plugin to remove manual resolution
5. Move image tools to systems plugin
6. Update brain.config.ts (remove imagePlugin)
7. Run full test suite

---

## Testing Strategy

1. Existing image tests should pass (just moved)
2. Existing blog tests should pass (resolution now automatic)
3. Add new entity-service tests for ContentResolver
4. Add integration test: create note with inline image, verify resolution

---

## Risks & Mitigations

**Risk:** Performance - resolving images on every entity read
**Mitigation:** Only resolve if content contains `entity://image/` pattern (fast string check); entity types can opt out

**Risk:** Breaking existing image tools
**Mitigation:** Move tools to systems plugin (already a core dependency)

**Risk:** Circular dependency (entity-service → image → entity-service)
**Mitigation:** Image package only exports schemas/utilities, no entity-service dependency
