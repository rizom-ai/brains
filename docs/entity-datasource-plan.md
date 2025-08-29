# Entity DataSource Implementation Plan

## Problem Statement

Dynamic routes need to display entity data (e.g., topic list and detail pages), but:

- Templates expect specific schemas (TopicListData, TopicDetailData)
- Entities have different schemas (TopicEntity)
- Need transformation between entity data and template schemas

## Solution: Plugin-Specific DataSources

Each plugin that has entity-based templates provides its own DataSource that:

1. **Fetches** raw entities from EntityService
2. **Transforms** entities to match template schemas

## Implementation Details

### 1. TopicsDataSource

Location: `plugins/topics/src/datasources/topics-datasource.ts`

```typescript
// Schema for fetch query parameters
const entityFetchQuerySchema = z.object({
  entityType: z.string(),
  query: z
    .object({
      id: z.string().optional(),
      limit: z.number().optional(),
    })
    .optional(),
});

export class TopicsDataSource implements DataSource {
  id = "topics:entities";
  name = "Topics Entity DataSource";

  constructor(private entityService: EntityService) {}

  /**
   * Fetch raw entities based on query
   * Returns validated entity or entity array
   */
  async fetch<T>(query: unknown, schema: z.ZodSchema<T>): Promise<T> {
    // Parse and validate query parameters
    const params = entityFetchQuerySchema.parse(query);

    if (params.query?.id) {
      // Fetch single entity
      const entity = await this.entityService.getEntity(
        params.entityType,
        params.query.id,
      );
      if (!entity) {
        throw new Error(`Entity not found: ${params.query.id}`);
      }
      return schema.parse(entity);
    }

    // Fetch entity list
    const entities = await this.entityService.listEntities(
      params.entityType,
      params.query || { limit: 100 },
    );

    return schema.parse(entities);
  }

  /**
   * Transform entities to template format
   * Format: "list" or "detail"
   */
  async transform<T>(
    content: unknown, // Raw entities from fetch
    format: string, // "list" or "detail"
    schema: z.ZodSchema<T>,
  ): Promise<T> {
    const adapter = new TopicAdapter();

    if (format === "detail") {
      // Transform single entity to TopicDetailData
      const entity = topicEntitySchema.parse(content);
      const parsed = adapter.parseTopicBody(entity.content);

      const detailData = {
        id: entity.id,
        title: parsed.title,
        summary: parsed.summary,
        content: parsed.content,
        keywords: parsed.keywords,
        sources: parsed.sources.map((id) => ({
          id,
          title: `Source ${id}`,
          type: "unknown",
        })),
        created: entity.created,
        updated: entity.updated,
      };

      return schema.parse(detailData);
    }

    if (format === "list") {
      // Transform entity array to TopicListData
      const entities = z.array(topicEntitySchema).parse(content);

      const topics = entities.map((entity) => {
        const parsed = adapter.parseTopicBody(entity.content);
        return {
          id: entity.id,
          title: parsed.title,
          summary: parsed.summary,
          keywords: parsed.keywords,
          sourceCount: parsed.sources.length,
          created: entity.created,
          updated: entity.updated,
        };
      });

      return schema.parse({
        topics,
        totalCount: topics.length,
      });
    }

    throw new Error(`Unknown format: ${format}`);
  }
}
```

### 2. ContentService Updates

The ContentService needs to orchestrate fetch + transform when resolving content:

```typescript
// In resolveContent method
if (template.dataSourceId && options.dataParams) {
  const dataSource = this.dataSourceRegistry.get(template.dataSourceId);

  // First fetch raw data
  const rawData = await dataSource.fetch(
    options.dataParams,
    // Schema for raw entities - determined by DataSource
    z.unknown(), // DataSource knows its entity schema
  );

  // Then transform if format specified
  if (options.transformFormat) {
    return await dataSource.transform(
      rawData,
      options.transformFormat,
      template.schema, // Final template schema
    );
  }

  // Or return raw data if no transform needed
  return template.schema.parse(rawData);
}
```

### 3. Site-Builder Integration

Site-builder passes contentEntity configuration to ContentService:

```typescript
private async getContentForSection(
  section: SectionDefinition,
  route: { id: string },
  environment: "preview" | "production" = "preview",
): Promise<unknown> {
  if (section.contentEntity) {
    const format = section.contentEntity.query?.id ? "detail" : "list";

    return await this.context.resolveContent(section.template, {
      dataParams: section.contentEntity,  // For fetch
      transformFormat: format,             // For transform
      fallback: section.content,
    });
  }

  // Regular content resolution...
}
```

### 4. Template Configuration

Topic templates specify their DataSource:

```typescript
export const topicListTemplate = createTemplate<TopicListData>({
  name: "topics:topic-list",
  description: "List view of all discovered topics",
  schema: topicListSchema,
  dataSourceId: "topics:entities", // Uses TopicsDataSource
  // ...
});
```

## Key Benefits

1. **Type Safety**: All data validated with zod schemas, no type casting
2. **Separation of Concerns**:
   - DataSource handles fetch/transform
   - Templates define schemas
   - Site-builder just passes configuration
3. **Plugin Ownership**: Each plugin owns its entity transformation logic
4. **Reusability**: Fetch and transform methods can be used independently
5. **Extensibility**: Easy to add new entity-based templates

## Migration Path

1. Create TopicsDataSource in topics plugin
2. Register DataSource when plugin initializes
3. Update ContentService to handle fetch + transform flow
4. Update site-builder to pass contentEntity as dataParams
5. Test with actual topic entities

## Future Considerations

- Could create a base EntityDataSource class for common patterns
- Transform format could be more sophisticated (e.g., "list-compact", "list-full")
- Could cache transformed data for performance
