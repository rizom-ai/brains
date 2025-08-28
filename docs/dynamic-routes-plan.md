# Dynamic Routes Planning Document

## Overview

Implement convention-based dynamic route generation for entity types in the site-builder plugin. This allows plugins to automatically get index and detail pages for their entities without explicit route registration.

## Convention

When a plugin registers an entity type and provides matching templates, site-builder automatically generates routes at build time:

- Entity type `"topic"` with templates `"topic-list"` and `"topic-detail"`
- Generates: `/topics` (index) and `/topics/[id]` (for each entity)

## Implementation Plan

### 1. Add Dynamic Route Discovery to Site-Builder

**File**: `plugins/site-builder/src/lib/dynamic-route-generator.ts` (new)

```typescript
export class DynamicRouteGenerator {
  async generateEntityRoutes(
    context: ServicePluginContext,
    routeRegistry: RouteRegistry,
  ): Promise<void> {
    // Get all registered entity types
    const entityTypes = context.getRegisteredEntityTypes();

    for (const entityType of entityTypes) {
      // Check for matching templates (try each plugin prefix)
      const plugins = context.getRegisteredPlugins();

      for (const pluginId of plugins) {
        const listTemplateName = `${pluginId}:${entityType}-list`;
        const detailTemplateName = `${pluginId}:${entityType}-detail`;

        const listTemplate = context.getViewTemplate(listTemplateName);
        const detailTemplate = context.getViewTemplate(detailTemplateName);

        if (listTemplate && detailTemplate) {
          // Register index route
          routeRegistry.register({
            id: `${entityType}-index`,
            path: `/${entityType}s`, // pluralized
            title: `${capitalize(entityType)}s`,
            description: `All ${entityType}s`,
            sections: [
              {
                id: "list",
                template: listTemplateName,
              },
            ],
            pluginId,
            isDynamic: true,
          });

          // Get all entities and register detail routes
          const entities = await context.entityService.listEntities(entityType);

          for (const entity of entities) {
            routeRegistry.register({
              id: `${entityType}-${entity.id}`,
              path: `/${entityType}s/${entity.id}`,
              title: entity.title || `${capitalize(entityType)}: ${entity.id}`,
              description: `${capitalize(entityType)} detail`,
              sections: [
                {
                  id: "detail",
                  template: detailTemplateName,
                  contentEntity: {
                    entityType,
                    query: { id: entity.id },
                  },
                },
              ],
              pluginId,
              isDynamic: true,
            });
          }

          break; // Found templates for this entity type
        }
      }
    }
  }
}
```

### 2. Extend RouteDefinition Schema

**File**: `plugins/site-builder/src/types/routes.ts`

Add optional fields to track dynamic routes:

```typescript
export const RouteDefinitionSchema = z.object({
  // ... existing fields ...
  isDynamic: z.boolean().optional(), // Marks auto-generated routes
  sourceEntityType: z.string().optional(), // Entity type that generated this
});
```

### 3. Integrate into Build Process

**File**: `plugins/site-builder/src/lib/site-builder.ts`

Modify the build method:

```typescript
async build(options: SiteBuilderOptions): Promise<BuildResult> {
  // ... existing setup ...

  // Generate dynamic routes before building
  if (options.generateDynamicRoutes !== false) {
    const generator = new DynamicRouteGenerator(this.context, this.routeRegistry);
    await generator.generateEntityRoutes();
  }

  // Get all registered routes (now includes dynamic ones)
  const routes = this.routeRegistry.list();

  // ... continue with build ...
}
```

### 4. Update Topics Plugin

**File**: `plugins/topics/src/index.ts`

Simplify to just register templates:

```typescript
override async onRegister(context: ServicePluginContext): Promise<void> {
  // Register entity type
  const adapter = new TopicAdapter();
  context.registerEntityType("topic", adapter.schema, adapter);

  // Register templates - these enable automatic route generation
  context.registerTemplates({
    "topic-list": topicListTemplate,
    "topic-detail": topicDetailTemplate
  });

  // No route registration needed!
}
```

### 5. Create Topic Templates

**File**: `plugins/topics/src/templates/topic-list.ts` (new)

```typescript
export const topicListTemplate: ViewTemplate = {
  name: "topic-list",
  component: TopicListComponent,
  schema: z.object({
    topics: z.array(topicEntitySchema),
  }),
  capabilities: {
    canRender: true,
    canGenerate: false, // List pages use actual entities
  },
};
```

**File**: `plugins/topics/src/templates/topic-detail.ts` (new)

```typescript
export const topicDetailTemplate: ViewTemplate = {
  name: "topic-detail",
  component: TopicDetailComponent,
  schema: topicEntitySchema,
  capabilities: {
    canRender: true,
    canGenerate: false, // Detail pages use actual entities
  },
};
```

## Benefits

1. **Zero Configuration**: Plugins just provide entities and templates
2. **Consistent URLs**: All entity types follow same pattern
3. **Automatic Discovery**: Site-builder finds and generates routes
4. **Clean Separation**: Plugins focus on domain logic, site-builder handles routing
5. **Scalable**: Works for any entity type (topics, profiles, projects, etc.)

## Testing Plan

1. Create test topic entities
2. Run site build
3. Verify generated files:
   - `/topics/index.html` - shows all topics
   - `/topics/[topic-id]/index.html` - shows each topic
4. Add profile entity with templates
5. Verify profile pages are also generated

## Future Enhancements

1. **Custom URL patterns**: Allow entities to specify custom slugs
2. **Pagination**: Handle large entity lists with paginated index pages
3. **Filtering**: Support filtered index pages (e.g., `/topics/category/[cat]`)
4. **Related Entities**: Generate pages showing relationships

## Implementation Status

- [ ] Create DynamicRouteGenerator class
- [ ] Update RouteDefinition schema
- [ ] Integrate into build process
- [ ] Create topic templates
- [ ] Test with real entities
- [ ] Documentation updates

This approach makes adding new entity types trivial - just define the entity and provide list/detail templates, and the pages are automatically generated.
