# Plan: Series as Cross-Content EntityPlugin

## Context

Series are currently embedded in the blog plugin as a second entity type. They're auto-derived from posts' `seriesName` field, with a manager, adapter, subscriptions, enhance-series tool, and datasource — all tightly coupled to blog.

Making series its own EntityPlugin enables:

- **Cross-content series** — series can span posts, decks, and any entity type with a `seriesName` field
- **Clean blog plugin** — blog becomes a single-entity EntityPlugin (post only)
- **Proper entity-plugin pattern** — one entity type per EntityPlugin

## Design

Series EntityPlugin watches entity events across ALL types with `seriesName` metadata. It auto-creates/deletes series based on which entities reference them.

### Series EntityPlugin

```typescript
export class SeriesPlugin extends EntityPlugin<Series> {
  readonly entityType = "series";
  readonly schema = seriesSchema;
  readonly adapter = new SeriesAdapter();

  protected createGenerationHandler(context): JobHandler {
    // Generates AI description from all entities in the series
    // Replaces blog_enhance-series tool
    return new SeriesGenerationHandler(this.logger, context);
  }

  protected getDataSources(): DataSource[] {
    return [new SeriesDataSource(this.logger)];
  }

  protected override async onRegister(context): Promise<void> {
    // Watch entity:created/updated/deleted for ANY type with seriesName
    // Not just posts — decks, projects, anything
    subscribeToSeriesEvents(context, this.logger);
  }
}
```

### What moves from blog → series plugin

| File                                                        | Destination                                           |
| ----------------------------------------------------------- | ----------------------------------------------------- |
| `plugins/blog/src/schemas/series.ts`                        | `plugins/series/src/schemas/series.ts`                |
| `plugins/blog/src/adapters/series-adapter.ts`               | `plugins/series/src/adapters/series-adapter.ts`       |
| `plugins/blog/src/services/series-manager.ts`               | `plugins/series/src/services/series-manager.ts`       |
| `plugins/blog/src/lib/series-subscriptions.ts`              | `plugins/series/src/lib/series-subscriptions.ts`      |
| `plugins/blog/src/tools/enhance-series.ts`                  | Deleted — replaced by `series:generation` handler     |
| `plugins/blog/src/datasources/series-datasource.ts`         | `plugins/series/src/datasources/series-datasource.ts` |
| `plugins/blog/src/templates/series-description-template.ts` | `plugins/series/src/templates/`                       |
| `plugins/blog/src/templates/series-list.tsx`                | `plugins/series/src/templates/`                       |
| `plugins/blog/src/templates/series-detail.tsx`              | `plugins/series/src/templates/`                       |
| `plugins/blog/src/routes/series-route-generator.ts`         | `plugins/series/src/routes/`                          |

### Cross-content series subscription

```typescript
// Subscribe to ANY entity type, not just posts
for (const event of ["entity:created", "entity:updated"] as const) {
  context.messaging.subscribe(event, async (message) => {
    // Check if entity has seriesName in metadata — works for posts, decks, etc.
    if (message.payload.entity?.metadata?.seriesName) {
      await seriesManager.handleEntityChange(message.payload.entity);
    }
    return { success: true };
  });
}
```

### Blog plugin after series extraction

Blog registers only:

- `post` entity type + adapter
- `post:generation` handler
- Blog datasource, RSS datasource
- Blog templates
- Publish pipeline + RSS subscriptions
- Zero tools → clean EntityPlugin

### What stays on blog posts

- `seriesName` and `seriesIndex` frontmatter fields (unchanged)
- Posts still reference series by name
- Badge rendering ("Part X of Series Name") stays in blog templates

### Brain model changes

Series plugin added to rover capabilities:

```typescript
capabilities: [
  // ... existing
  seriesPlugin(),
];
```

## Steps

1. Create `plugins/series/` package with EntityPlugin skeleton
2. Move series files from blog to series plugin
3. Convert `enhance-series` tool → `series:generation` handler
4. Update series subscriptions to watch all entity types (not just posts)
5. Remove series code from blog plugin
6. Add series plugin to rover brain model
7. Update tests
8. Verify series list/detail routes still work

## Deferred

- Series datasource: could compute from posts instead of reading series entities (the original simplify-series idea). Revisit once cross-content is working.

## Verification

1. `bun test` — all tests pass
2. Series auto-created when post has `seriesName`
3. Series auto-created when deck has `seriesName`
4. `system_create` with entityType "series" triggers generation handler
5. Series list/detail pages render correctly
6. Blog plugin has zero tools
