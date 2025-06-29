# Content Type Schema Registry Implementation Plan

## Problem Statement

Currently, when retrieving generated content, we perform unsafe type casts without validation:

```typescript
hero: existingHero as LandingPageData["hero"];
```

This is brittle and could cause runtime errors if the stored content doesn't match the expected schema.

## Solution Overview

Implement a content type schema registry that maps content types to their corresponding Zod schemas, enabling:

1. Validation when retrieving generated content
2. Type-safe content retrieval
3. Schema evolution support

## Architecture Decision: Registry in Shell

The ContentTypeRegistry will be implemented in the Shell because:

- Aligns with existing architecture patterns (SchemaRegistry, EntityRegistry)
- Enables content sharing between plugins
- ContentGenerationService already lives in shell
- Provides central validation point
- Reduces code duplication

## Design Decisions

### 1. Always Validate

- Validation is core to our data integrity
- No option to skip validation
- Fail fast on invalid data

### 2. No Versioning Initially

- Start simple without schema versioning
- Add versioning/migration support when first needed
- Focus on core functionality first

### 3. Namespaced Content Types

- Use plugin-namespaced content types to avoid collisions
- Format: `"plugin:category:type"` (e.g., `"webserver:landing:hero"`)
- Clear ownership and organization
- Enables filtering by plugin namespace

## Implementation Plan

### Phase 1: Add ContentTypeRegistry to Shell

1. Create `ContentTypeRegistry` class in shell:

   ```typescript
   class ContentTypeRegistry {
     private schemas = new Map<string, z.ZodType<unknown>>();

     register(contentType: string, schema: z.ZodType<unknown>): void {
       // Validate namespace format
       if (!contentType.includes(":")) {
         throw new Error(`Content type must be namespaced: ${contentType}`);
       }
       this.schemas.set(contentType, schema);
     }

     get(contentType: string): z.ZodType<unknown> | null {
       return this.schemas.get(contentType) ?? null;
     }

     validate(contentType: string, data: unknown): unknown {
       const schema = this.get(contentType);
       if (!schema) {
         throw new Error(
           `No schema registered for content type: ${contentType}`,
         );
       }
       return schema.parse(data);
     }

     list(namespace?: string): string[] {
       const types = Array.from(this.schemas.keys());
       if (namespace) {
         return types.filter((t) => t.startsWith(`${namespace}:`));
       }
       return types;
     }
   }
   ```

2. Update Shell to:
   - Initialize ContentTypeRegistry
   - Add to registry for dependency injection
   - Expose via PluginContext as `context.contentTypes`

3. Update ContentGenerationService to:
   - Accept ContentTypeRegistry in initialization
   - Use the registry for validation when `save: true`

### Phase 2: Update Generated Content Entity

1. Update `GeneratedContent` to use namespaced content types
2. Remove `schemaName` field (contentType is sufficient with registry)

### Phase 3: Update Webserver Plugin

1. Update content types to be namespaced:

   ```typescript
   // Old
   contentType: "landing:hero";

   // New
   contentType: "webserver:landing:hero";
   ```

2. Register schemas during plugin initialization:

   ```typescript
   context.contentTypes.register("webserver:landing:hero", landingPageSchema);
   context.contentTypes.register("webserver:dashboard:stats", dashboardSchema);
   ```

3. Update content retrieval to validate:

   ```typescript
   async getExistingSiteContent(page: string, section: string): Promise<unknown | null> {
     const contentType = `webserver:${page}:${section}`;

     // ... fetch content ...

     if (matchingContent) {
       // This will throw if validation fails
       return context.contentTypes.validate(contentType, matchingContent.data);
     }
   }
   ```

### Phase 4: Update MCP Adapters

1. Update ContentGenerationAdapter to use the registry
2. Add MCP tool to list registered content types

## Benefits

1. **Type Safety**: No more unsafe casts
2. **Runtime Validation**: Catch data corruption immediately
3. **Namespace Organization**: Clear ownership and filtering
4. **Discoverability**: Can list all content types by plugin
5. **Fail Fast**: Invalid data caught at retrieval, not usage

## Migration Path

1. Add registry without breaking changes
2. Update existing content types to namespaced format
3. Migrate stored content to use new namespaced types
4. Remove unsafe casts from code

## Future Enhancements

1. Schema versioning and migration support
2. Content type inheritance/composition
3. Validation performance monitoring
4. Schema documentation generation
