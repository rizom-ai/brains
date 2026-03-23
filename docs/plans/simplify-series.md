# Plan: Simplify Series — Computed View, Not Entity

## Context

Series are auto-derived entities created from blog posts' `seriesName` field. The series entity holds only a description (AI-generated) and optional cover image — both derivable from the posts themselves. The auto-create/delete lifecycle, series manager, adapter, subscriptions, and enhance tool are overhead for two derived fields.

## Design

Series become a computed view over blog posts. No entity, no storage. The datasource groups posts by `seriesName` and derives everything from the posts.

**Series list page:**

- Query all published posts, group by `seriesName`
- Per series: title = seriesName, cover = first post's cover image, description = first post's excerpt, postCount = group size

**Series detail page:**

- Query posts where `seriesName = X`, sort by `seriesIndex`
- Cover image = first post's cover image
- Description = first post's excerpt

## What gets deleted

| File                                            | Why                                  |
| ----------------------------------------------- | ------------------------------------ |
| `plugins/blog/src/schemas/series.ts`            | No series entity                     |
| `plugins/blog/src/adapters/series-adapter.ts`   | No series entity                     |
| `plugins/blog/src/services/series-manager.ts`   | No auto-create/delete lifecycle      |
| `plugins/blog/src/lib/series-subscriptions.ts`  | No entity change watchers            |
| `plugins/blog/src/tools/enhance-series.ts`      | No AI-generated description to store |
| `plugins/blog/test/enhance-series-tool.test.ts` | Tool removed                         |

## What gets rewritten

| File                                                | Change                                                                |
| --------------------------------------------------- | --------------------------------------------------------------------- |
| `plugins/blog/src/datasources/series-datasource.ts` | Rewrite: query posts grouped by seriesName instead of series entities |
| `plugins/blog/src/templates/series-list.tsx`        | Update: data comes from post groups, not series entities              |
| `plugins/blog/src/templates/series-detail.tsx`      | Update: data comes from post query, not series entity + posts         |

## What stays unchanged

- `seriesName` and `seriesIndex` on blog post frontmatter
- Series routes (`/series`, `/series/{slug}`)
- Entity route config (`series: { label: "Series", navigation: { slot: "secondary" } }`)
- Blog post badges showing "Part X of Series Name"

## What the blog plugin stops doing

- Registering `series` entity type
- Registering series adapter
- Creating/deleting series entities on post changes
- Subscribing to `entity:created/updated/deleted` for series management
- Exposing `blog_enhance-series` tool

## Datasource rewrite

```typescript
// Series list: group published posts by seriesName
async fetchSeriesList(): Promise<SeriesListItem[]> {
  const posts = await entityService.listEntities("post", { publishedOnly: true });
  const groups = groupBy(posts.filter(p => p.metadata.seriesName), "metadata.seriesName");

  return Object.entries(groups).map(([name, posts]) => {
    const sorted = posts.sort((a, b) => a.metadata.seriesIndex - b.metadata.seriesIndex);
    const first = sorted[0];
    return {
      title: name,
      slug: slugify(name),
      postCount: sorted.length,
      description: first.frontmatter.excerpt,
      coverImageId: first.frontmatter.coverImageId,
    };
  });
}

// Series detail: posts for a specific series
async fetchSeriesDetail(seriesName: string): Promise<SeriesDetail> {
  const posts = await entityService.listEntities("post", {
    publishedOnly: true,
    filter: { metadata: { seriesName } },
  });
  const sorted = posts.sort((a, b) => a.metadata.seriesIndex - b.metadata.seriesIndex);
  const first = sorted[0];

  return {
    title: seriesName,
    slug: slugify(seriesName),
    description: first?.frontmatter.excerpt,
    coverImageId: first?.frontmatter.coverImageId,
    posts: sorted,
  };
}
```

## Steps

1. Rewrite series datasource (tests first)
2. Update series list/detail templates for new data shape
3. Remove series entity registration from blog plugin
4. Delete series schema, adapter, manager, subscriptions, enhance tool
5. Remove series entity type from CMS config (if registered)
6. Verify routes still work

## Verification

1. `bun test plugins/blog/` — all tests pass
2. `bun run typecheck` / `bun run lint`
3. Series list page renders with correct post counts and covers
4. Series detail page shows posts in order with "Part X of Y"
5. No series entities in database or brain-data directory
6. Blog post badges still link to series pages
