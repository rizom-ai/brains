# Implementation Plan: Enhanced Analytics Plugin

## Overview

Enhance the analytics plugin to fetch richer data from Cloudflare and store it in properly structured entities with frontmatter/metadata patterns.

**Goals:**

1. Fetch per-page traffic data (which entities get views)
2. Fetch referrer sources, device types, countries
3. Store data using frontmatter/metadata pattern (not all in metadata)
4. Add new dashboard widgets for breakdowns
5. Remove misleading bounceRate/avgTimeOnPage (always 0)

---

## Entity Design

### 1. Enhanced `website-metrics` Entity

**Frontmatter** (full data in markdown):

```typescript
export const websiteMetricsFrontmatterSchema = z.object({
  period: z.enum(["daily", "weekly", "monthly"]),
  date: z.string(),
  pageviews: z.number(),
  visitors: z.number(),

  // Breakdowns (arrays in frontmatter, not metadata)
  topPages: z
    .array(
      z.object({
        path: z.string(),
        views: z.number(),
      }),
    )
    .default([]),

  topReferrers: z
    .array(
      z.object({
        host: z.string(),
        visits: z.number(),
      }),
    )
    .default([]),

  devices: z
    .object({
      desktop: z.number(),
      mobile: z.number(),
      tablet: z.number(),
    })
    .default({ desktop: 0, mobile: 0, tablet: 0 }),

  topCountries: z
    .array(
      z.object({
        country: z.string(),
        visits: z.number(),
      }),
    )
    .default([]),
});
```

**Metadata** (queryable subset):

```typescript
export const websiteMetricsMetadataSchema =
  websiteMetricsFrontmatterSchema.pick({
    period: true,
    date: true,
    pageviews: true,
    visitors: true,
  });
```

**Markdown file example:**

```markdown
---
period: daily
date: "2025-01-22"
pageviews: 150
visitors: 80
topPages:
  - path: /essays/economy-of-abundance
    views: 45
  - path: /
    views: 30
topReferrers:
  - host: google.com
    visits: 25
  - host: linkedin.com
    visits: 15
devices:
  desktop: 60
  mobile: 38
  tablet: 2
topCountries:
  - country: United States
    visits: 40
  - country: Netherlands
    visits: 15
---

Website metrics for 2025-01-22
```

### 2. New `page-metrics` Entity (for entity correlation)

**Frontmatter:**

```typescript
export const pageMetricsFrontmatterSchema = z.object({
  path: z.string(),
  linkedEntityType: z.string().optional(),
  linkedEntityId: z.string().optional(),
  totalPageviews: z.number(),
  lastUpdated: z.string(),

  // Rolling history (last 30 days)
  history: z
    .array(
      z.object({
        date: z.string(),
        views: z.number(),
      }),
    )
    .default([]),
});
```

**Metadata:**

```typescript
export const pageMetricsMetadataSchema = pageMetricsFrontmatterSchema.pick({
  path: true,
  linkedEntityType: true,
  linkedEntityId: true,
  totalPageviews: true,
  lastUpdated: true,
});
```

**ID format:** `page-metrics-{path-slug}` (e.g., `page-metrics-essays-economy-of-abundance`)

---

## Cloudflare Client Changes

### New Methods

```typescript
// Get top pages for a date range
async getTopPages(options: {
  startDate: string;
  endDate: string;
  limit?: number; // default 20
}): Promise<Array<{ path: string; views: number }>>

// Get referrer breakdown
async getTopReferrers(options: {
  startDate: string;
  endDate: string;
  limit?: number;
}): Promise<Array<{ host: string; visits: number }>>

// Get device breakdown
async getDeviceBreakdown(options: {
  startDate: string;
  endDate: string;
}): Promise<{ desktop: number; mobile: number; tablet: number }>

// Get country breakdown
async getTopCountries(options: {
  startDate: string;
  endDate: string;
  limit?: number;
}): Promise<Array<{ country: string; visits: number }>>
```

### GraphQL Query Updates

Add dimension-specific queries:

```graphql
# Top pages query
query GetTopPages(...) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      rumPageloadEventsAdaptiveGroups(
        filter: { siteTag: $siteTag, date_geq: $start, date_leq: $end }
        limit: 20
        orderBy: [count_DESC]
      ) {
        count
        dimensions {
          requestPath
        }
      }
    }
  }
}
```

Similar queries for `refererHost`, `deviceType`, `countryName` dimensions.

---

## Dashboard Widgets

### Current (to modify)

- **Website Analytics** (StatsWidget): Remove bounceRate/avgTimeOnPage, show pageviews/visitors only

### New Widgets

| Widget          | Renderer    | Section | Priority | Data                                       |
| --------------- | ----------- | ------- | -------- | ------------------------------------------ |
| Top Pages       | ListWidget  | primary | 31       | `{ items: [{ id: path, name: path }] }`    |
| Traffic Sources | ListWidget  | sidebar | 50       | `{ items: [{ id: host, name: host }] }`    |
| Devices         | StatsWidget | sidebar | 51       | `{ desktop: N, mobile: N, tablet: N }`     |
| Countries       | ListWidget  | sidebar | 52       | `{ items: [{ id: code, name: country }] }` |

---

## Files to Modify

| File                                                        | Changes                                                                          |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `plugins/analytics/src/schemas/website-metrics.ts`          | Add frontmatter schema, refactor metadata to use `.pick()`, add breakdown fields |
| `plugins/analytics/src/adapters/website-metrics-adapter.ts` | Update toMarkdown/fromMarkdown for new schema                                    |
| `plugins/analytics/src/lib/cloudflare-client.ts`            | Add new methods for dimensions                                                   |
| `plugins/analytics/src/tools/index.ts`                      | Update fetch_website tool to include breakdowns                                  |
| `plugins/analytics/src/index.ts`                            | Add new dashboard widgets, update existing widget                                |

## Files to Create

| File                                                     | Purpose            |
| -------------------------------------------------------- | ------------------ |
| `plugins/analytics/src/schemas/page-metrics.ts`          | New entity schema  |
| `plugins/analytics/src/adapters/page-metrics-adapter.ts` | New entity adapter |

---

## Implementation Phases

### Phase 1: Schema Refactor

1. Refactor `website-metrics` schema to use frontmatter/metadata pattern
2. Add breakdown fields to frontmatter schema
3. Update adapter for new schema
4. Run tests, fix any breakages

### Phase 2: Cloudflare Client Enhancement

1. Add `getTopPages()` method with `requestPath` dimension
2. Add `getTopReferrers()` method with `refererHost` dimension
3. Add `getDeviceBreakdown()` method with `deviceType` dimension
4. Add `getTopCountries()` method with `countryName` dimension
5. Add tests for new methods

### Phase 3: Tool Updates

1. Update `fetch_website` tool to call all new methods
2. Store breakdowns in entity frontmatter
3. Update `get_website_trends` to return breakdown data

### Phase 4: Page Metrics Entity

1. Create `page-metrics` schema with frontmatter/metadata pattern
2. Create adapter
3. Register entity type in plugin
4. Add logic to update page-metrics from daily fetches
5. Add path → entity linking logic

### Phase 5: Dashboard Widgets

1. Update "Website Analytics" widget (remove misleading fields)
2. Add "Top Pages" widget (ListWidget)
3. Add "Traffic Sources" widget (ListWidget)
4. Add "Devices" widget (StatsWidget)
5. Add "Countries" widget (ListWidget)

---

## Path → Entity Linking

To correlate page paths with brain entities:

```typescript
function linkPathToEntity(path: string): { type?: string; id?: string } {
  // /essays/{slug} → essay entity
  const essayMatch = path.match(/^\/essays\/([^/]+)/);
  if (essayMatch) return { type: "post", id: essayMatch[1] };

  // /decks/{slug} → deck entity
  const deckMatch = path.match(/^\/decks\/([^/]+)/);
  if (deckMatch) return { type: "deck", id: deckMatch[1] };

  // /portfolio/{slug} → project entity
  const projectMatch = path.match(/^\/portfolio\/([^/]+)/);
  if (projectMatch) return { type: "project", id: projectMatch[1] };

  return {};
}
```

---

## Verification

1. **Unit tests**: Schema validation, adapter round-trip, Cloudflare client methods
2. **Integration**: Fetch real data from Cloudflare, verify entity storage
3. **Dashboard**: Build site, verify widgets render with breakdown data
4. **Manual check**:

   ```bash
   # Fetch analytics
   bun run shell -- tool analytics_fetch_website

   # Check stored entity
   cat apps/professional-brain/brain-data/website-metrics/website-metrics-daily-2025-01-22.md

   # Build dashboard
   bun run shell -- tool site-builder_build --environment preview
   ```

---

## Success Criteria

- [ ] `website-metrics` entity uses frontmatter/metadata pattern correctly
- [ ] Breakdowns (topPages, topReferrers, devices, countries) stored in frontmatter
- [ ] Dashboard shows new widgets with breakdown data
- [ ] `page-metrics` entities created and linked to brain entities
- [ ] No more misleading bounceRate/avgTimeOnPage (removed)
- [ ] All tests pass
