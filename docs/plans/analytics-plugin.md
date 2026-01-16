# Analytics Plugin Implementation Plan

## Overview

Create a new `analytics` plugin to collect, store, and query metrics from:

1. **Website**: Page views, visitors, traffic sources (via PostHog EU Cloud API)
2. **Social Media**: Post engagement - likes, comments, shares, impressions (via messaging to social-media plugin)

**Design principle**: Minimal dependencies - use existing integrations where possible.

---

## Key Decisions

| Decision             | Choice                      | Rationale                                                                   |
| -------------------- | --------------------------- | --------------------------------------------------------------------------- |
| Architecture         | New dedicated plugin        | Cross-cutting concern, own entity types, extensible for future platforms    |
| Website provider     | PostHog EU Cloud            | Privacy-focused, GDPR jurisdiction, Terraform support, 1M events/month free |
| Storage              | Entities (markdown)         | Consistent with codebase, git-versioned, queryable                          |
| Website granularity  | Daily snapshots             | Flexible for aggregation, matches PostHog API                               |
| Social granularity   | Per-post (updated in place) | Track engagement over time per post                                         |
| Collection           | Scheduled + on-demand       | Consistent data collection + manual refresh                                 |
| LinkedIn credentials | Share with social-media     | No duplicate credential management                                          |
| Dependencies         | Soft (runtime query)        | No package imports, queries entities if they exist                          |
| Social metrics fetch | Messaging                   | Analytics sends message, social-media handles platform-specific API calls   |

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

1. `analytics_fetch_website` - Fetch metrics from PostHog API and store
2. `analytics_get_website_trends` - Query stored historical data

### Social Tools

1. `analytics_fetch_social` - Fetch engagement from LinkedIn API and store
2. `analytics_get_social_summary` - Query all posts with metrics

---

## Integration Points (Soft Dependencies)

**No package.json dependencies on other plugins.** Uses messaging for cross-plugin communication.

### With social-media plugin (via messaging)

**Analytics plugin sends:**

- `social-media:get-post-metrics` - Request metrics for a specific post
  - Input: `{ entityId: string }` (social-post entity ID)
  - Response: `{ impressions, likes, comments, shares, platform }`

**Social-media plugin handles:**

- Owns all platform-specific API integrations (LinkedIn, future Twitter, etc.)
- When new platform is added to social-media, analytics automatically gets metrics

**Flow:**

1. Analytics queries `entityService.listEntities("social-post")` to find published posts
2. For each post, sends `social-media:get-post-metrics` message
3. Social-media fetches from platform API and responds
4. Analytics stores the metrics

**Benefits:**

- Social-media is single source of truth for platform integrations
- Analytics remains platform-agnostic
- No duplicate API clients

### With site-builder plugin (none)

- No integration needed
- Site-builder injects PostHog tracking script (client-side)
- Analytics plugin fetches data from PostHog API (server-side)
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
  posthog: z
    .object({
      enabled: z.boolean().default(false),
      projectId: z.string(),
      apiKey: z.string(), // Personal API key from PostHog settings
    })
    .optional(),

  social: z
    .object({
      enabled: z.boolean().default(false),
      // Uses messaging to social-media plugin - no direct credentials needed
    })
    .optional(),
});
```

Environment variables:

```bash
# PostHog EU Cloud (free tier: 1M events/month)
POSTHOG_PROJECT_ID=12345
POSTHOG_API_KEY=phx_xxx

# Note: Social metrics use messaging to social-media plugin
# No additional env vars needed for social analytics
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
│   │   └── posthog-client.ts
│   └── tools/
│       ├── website-tools.ts
│       └── social-tools.ts
├── test/
└── package.json
```

Note: No LinkedIn/social API client - uses messaging to social-media plugin.

---

## Implementation Phases

### Phase 1: Plugin Scaffolding

- Create plugin structure with config schema
- Define entity schemas and adapters
- Register entity types

### Phase 2: PostHog Integration

- Implement PostHogClient for API calls
- Create `analytics_fetch_website` tool
- Create `analytics_get_website_trends` tool
- Add cron daemon for daily collection

### Phase 3: Social Analytics (via messaging)

- Add message handler to social-media plugin: `social-media:get-post-metrics`
- Create `analytics_fetch_social` tool (sends messages)
- Create `analytics_get_social_summary` tool
- Subscribe to `publish:completed` for auto-fetch

### Phase 4: Testing & Polish

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

### PostHog EU Cloud API

- Base URL: `https://eu.posthog.com`
- Auth: Personal API key (header: `Authorization: Bearer phx_xxx`)
- Endpoints:
  - `GET /api/projects/{project_id}/insights/trend/` - Pageviews over time
  - `GET /api/projects/{project_id}/events/` - Raw events
- Free tier: 1M events/month
- Terraform: `terraform-community-providers/posthog`

### Social Metrics (via messaging)

- Analytics sends `social-media:get-post-metrics` message
- Social-media plugin handles platform-specific API calls (LinkedIn, etc.)
- Response: `{ impressions, likes, comments, shares, platform }`

---

## Prerequisites

Before using this plugin:

1. **PostHog EU**: Sign up at eu.posthog.com, create project, add tracking script to site, get API key
2. **Social metrics**: Social-media plugin installed (handles platform API calls via messaging)

---

## Verification

1. **Unit tests**: Mock PostHog API and messaging responses, verify entity creation
2. **Integration test**: Use plugin harness
3. **Manual test**:
   - Set `POSTHOG_PROJECT_ID` and `POSTHOG_API_KEY` env vars
   - Run `analytics_fetch_website` tool
   - Verify website-metrics entity created in data directory
   - Run `analytics_fetch_social` tool (requires published social posts)
   - Verify social-metrics entity created for each post
4. **Cron verification**: Start shell, wait for scheduled collection, check entities created
