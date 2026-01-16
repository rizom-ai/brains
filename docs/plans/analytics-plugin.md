# Analytics Plugin Implementation Plan

## Overview

Create a new `analytics` plugin to collect, store, and query metrics from:

1. **Website**: Page views, visitors, traffic sources (via Umami Cloud API)
2. **Social Media**: Post engagement - likes, comments, shares, impressions (via LinkedIn API)

**Design principle**: Minimal dependencies - use existing integrations where possible.

---

## Key Decisions

| Decision             | Choice                      | Rationale                                                                |
| -------------------- | --------------------------- | ------------------------------------------------------------------------ |
| Architecture         | New dedicated plugin        | Cross-cutting concern, own entity types, extensible for future platforms |
| Website provider     | Umami Cloud (free tier)     | Privacy-focused, has API, no self-hosting needed, open source core       |
| Storage              | Entities (markdown)         | Consistent with codebase, git-versioned, queryable                       |
| Website granularity  | Daily snapshots             | Flexible for aggregation, matches Umami API                              |
| Social granularity   | Per-post (updated in place) | Track engagement over time per post                                      |
| Collection           | Scheduled + on-demand       | Consistent data collection + manual refresh                              |
| LinkedIn credentials | Share with social-media     | No duplicate credential management                                       |
| Dependencies         | Soft (runtime query)        | No package imports, queries entities if they exist                       |

---

## Entity Schemas

### 1. Website Metrics Entity

```typescript
// One entity per time period (daily/weekly/monthly)
// ID format: "website-metrics-daily-2025-01-15"
const websiteMetricsMetadataSchema = z.object({
  period: z.enum(["daily", "weekly", "monthly"]),
  startDate: z.string(), // ISO date
  endDate: z.string(),
  pageviews: z.number(),
  visitors: z.number(),
  visits: z.number(),
  bounces: z.number(),
  totalTime: z.number(), // seconds
  bounceRate: z.number(), // computed
  avgTimeOnPage: z.number(), // computed
});
```

### 2. Social Metrics Entity

```typescript
// One entity per post, updated with latest metrics
// ID format: "social-metrics-{platformPostId}"
const socialMetricsMetadataSchema = z.object({
  platform: z.enum(["linkedin"]),
  entityId: z.string(), // Reference to social-post entity
  platformPostId: z.string(), // LinkedIn post URN
  snapshotDate: z.string().datetime(),
  impressions: z.number(),
  likes: z.number(),
  comments: z.number(),
  shares: z.number(),
  engagementRate: z.number(), // computed
});
```

---

## MCP Tools

### Website Tools

1. `analytics_fetch_website` - Fetch metrics from Umami API and store
2. `analytics_get_website_trends` - Query stored historical data

### Social Tools

1. `analytics_fetch_social` - Fetch engagement from LinkedIn API and store
2. `analytics_get_social_summary` - Query all posts with metrics

---

## Integration Points (Soft Dependencies)

**No package.json dependencies on other plugins.** Uses runtime queries only.

### With social-media plugin (optional)

- Queries `entityService.listEntities("social-post")` to find published posts
- If no social-post entities exist, social analytics is simply skipped
- Reads `platformPostId` from entity metadata to fetch LinkedIn metrics
- Subscribe to `publish:completed` to auto-fetch metrics for new posts

### With site-builder plugin (none)

- No integration needed
- Site-builder injects tracking script (client-side)
- Analytics plugin fetches data from Umami API (server-side)
- Completely independent operations

---

## Fetch Strategy

Use **daemon with cron** (following publish-pipeline pattern):

```typescript
// Daily website metrics at 2 AM
websiteCron = new Cron("0 2 * * *", () => fetchWebsiteMetrics());

// Social metrics every 6 hours for recent posts
socialCron = new Cron("0 */6 * * *", () => fetchSocialMetrics());
```

Plus on-demand via MCP tools for manual refresh.

---

## Configuration

```typescript
const analyticsConfigSchema = z.object({
  umami: z
    .object({
      enabled: z.boolean().default(false),
      websiteId: z.string(),
      apiToken: z.string(), // From Umami Cloud dashboard
    })
    .optional(),

  linkedin: z
    .object({
      enabled: z.boolean().default(false),
      // Uses LINKEDIN_ACCESS_TOKEN env var (shared with social-media plugin)
    })
    .optional(),
});
```

Environment variables:

```bash
# Umami Cloud (free tier: 10k pageviews/month)
UMAMI_WEBSITE_ID=abc123
UMAMI_API_TOKEN=secret

# LinkedIn (shared with social-media plugin)
LINKEDIN_ACCESS_TOKEN=xxx  # Already exists
```

---

## File Structure

```
plugins/analytics/
├── src/
│   ├── index.ts
│   ├── plugin.ts
│   ├── config.ts
│   ├── schemas/
│   │   ├── website-metrics.ts
│   │   └── social-metrics.ts
│   ├── adapters/
│   │   ├── website-metrics-adapter.ts
│   │   └── social-metrics-adapter.ts
│   ├── lib/
│   │   ├── umami-client.ts
│   │   └── linkedin-analytics.ts
│   └── tools/
│       ├── website-tools.ts
│       └── social-tools.ts
├── test/
└── package.json
```

---

## Implementation Phases

### Phase 1: Plugin Scaffolding (1-2 hours)

- Create plugin structure with config schema
- Define entity schemas and adapters
- Register entity types

### Phase 2: Umami Integration (2-3 hours)

- Implement UmamiClient for API calls
- Create `analytics_fetch_website` tool
- Create `analytics_get_website_trends` tool
- Add cron daemon for daily collection

### Phase 3: LinkedIn Analytics (3-4 hours)

- Add `getPostAnalytics()` to LinkedIn client
- Create `analytics_fetch_social` tool
- Create `analytics_get_social_summary` tool
- Subscribe to `publish:completed` for auto-fetch

### Phase 4: Testing & Polish (1-2 hours)

- Unit tests with mocked API responses
- Integration test with harness
- Documentation

---

## Critical Files to Modify/Reference

**New files:**

- `plugins/analytics/` - New plugin directory

**Files to reference:**

- `plugins/publish-pipeline/src/scheduler.ts` - Cron pattern with croner
- `plugins/social-media/src/lib/linkedin-client.ts` - LinkedIn API pattern
- `plugins/summary/src/schemas/summary.ts` - Time-series entity pattern

---

## External API Notes

### Umami Cloud API

- Base URL: `https://api.umami.is`
- Auth: Bearer token (API token from dashboard)
- Endpoints: `/api/websites/{websiteId}/stats`, `/api/websites/{websiteId}/pageviews`
- Free tier: 10k pageviews/month, 6 months retention

### LinkedIn Analytics API

- OAuth scope: `r_member_social` (for personal posts)
- Endpoint: `GET /rest/memberCreatorPostAnalytics`
- Query: `q=entity&entity=(ugcPost:{encodedUrn})`
- Current social-media plugin stores `platformPostId` as `urn:li:ugcPost:xxx`

---

## Prerequisites

Before using this plugin:

1. **Umami Cloud**: Sign up at umami.is, add tracking script to site, get API token
2. **LinkedIn**: Existing social-media plugin setup (access token already configured)

---

## Verification

1. **Unit tests**: Mock Umami/LinkedIn API responses, verify entity creation
2. **Integration test**: Use plugin harness
3. **Manual test**:
   - Set `UMAMI_WEBSITE_ID` and `UMAMI_API_TOKEN` env vars
   - Run `analytics_fetch_website` tool
   - Verify website-metrics entity created in data directory
   - Run `analytics_fetch_social` tool (requires published social posts)
   - Verify social-metrics entity created for each post
4. **Cron verification**: Start shell, wait for scheduled collection, check entities created
