# Analytics Plugin Implementation Plan

## Overview

Create a new `analytics` plugin to collect, store, and query metrics from:

1. **Website**: Page views, visitors, traffic sources (via Cloudflare Web Analytics API)
2. **Social Media**: Post engagement - likes, comments, shares, impressions (via messaging to social-media plugin)

**Design principle**: Minimal dependencies - use existing integrations where possible.

---

## Key Decisions

| Decision             | Choice                      | Rationale                                                                  |
| -------------------- | --------------------------- | -------------------------------------------------------------------------- |
| Architecture         | New dedicated plugin        | Cross-cutting concern, own entity types, extensible for future platforms   |
| Website provider     | Cloudflare Web Analytics    | Full Terraform support, free, privacy-focused (no cookies), GDPR compliant |
| Storage              | Entities (markdown)         | Consistent with codebase, git-versioned, queryable                         |
| Website granularity  | Daily snapshots             | Flexible for aggregation, matches Cloudflare API                           |
| Social granularity   | Per-post (updated in place) | Track engagement over time per post                                        |
| Collection           | Scheduled + on-demand       | Consistent data collection + manual refresh                                |
| LinkedIn credentials | Share with social-media     | No duplicate credential management                                         |
| Dependencies         | Soft (runtime query)        | No package imports, queries entities if they exist                         |
| Social metrics fetch | Messaging                   | Analytics sends message, social-media handles platform-specific API calls  |

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

1. `analytics_fetch_website` - Fetch metrics from Cloudflare API and store
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

### With site-builder plugin

- Site-builder injects Cloudflare tracking script (client-side, via Terraform output)
- Analytics plugin fetches data from Cloudflare GraphQL API (server-side)
- Tracking script token provided via environment variable from Terraform

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
  cloudflare: z
    .object({
      enabled: z.boolean().default(false),
      accountId: z.string(),
      apiToken: z.string(), // API token with Analytics:Read permission
      siteTag: z.string(), // Site tag from Terraform
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

Environment variables (from Terraform outputs):

```bash
# Cloudflare Web Analytics (free, unlimited)
CLOUDFLARE_ACCOUNT_ID=xxx
CLOUDFLARE_API_TOKEN=xxx
CLOUDFLARE_ANALYTICS_SITE_TAG=xxx

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
│   │   └── cloudflare-client.ts
│   └── tools/
│       └── index.ts
├── test/
└── package.json
```

Note: No LinkedIn/social API client - uses messaging to social-media plugin.

---

## Implementation Phases

### Phase 1: Plugin Scaffolding ✅

- Create plugin structure with config schema
- Define entity schemas and adapters
- Register entity types

### Phase 2: Website Analytics Client ✅ (PostHog - to be replaced)

- ~~Implement PostHogClient for API calls~~ → Replace with CloudflareClient
- Create `analytics_fetch_website` tool
- Create `analytics_get_website_trends` tool
- Add cron daemon for daily collection

### Phase 2.5: Cloudflare Terraform Infrastructure

- Create `modules/cloudflare-analytics` Terraform module
- Provision `cloudflare_web_analytics_site` resource
- Output site_tag and tracking script
- Add tracking script injection to site-builder (client-side)
- Replace PostHogClient with CloudflareClient
- Update brain.config.ts to use Terraform-provided credentials
- Test end-to-end: tracking script → Cloudflare → analytics plugin

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
- `apps/professional-brain/deploy/terraform-state/modules/cloudflare-analytics/` - Terraform module

**Files to modify:**

- `plugins/analytics/src/lib/cloudflare-client.ts` - Replace PostHog with Cloudflare
- `plugins/site-builder/src/lib/head-collector.ts` - Add analytics script injection

**Files to reference:**

- `plugins/publish-pipeline/src/scheduler.ts` - Cron pattern with croner
- `apps/professional-brain/deploy/terraform-state/modules/bunny-cdn/` - Terraform module pattern

---

## External API Notes

### Cloudflare Web Analytics API

- GraphQL API: `https://api.cloudflare.com/client/v4/graphql`
- Auth: API Token with `Analytics:Read` permission
- Query example:

```graphql
query {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      rumPageloadEventsAdaptiveGroups(
        filter: { datetime_gt: $start, datetime_lt: $end, siteTag: $siteTag }
        limit: 1000
      ) {
        count
        dimensions {
          date
        }
        sum {
          visits
        }
      }
    }
  }
}
```

- Free tier: Unlimited
- Terraform: `cloudflare/cloudflare` provider, `cloudflare_web_analytics_site` resource

### Social Metrics (via messaging)

- Analytics sends `social-media:get-post-metrics` message
- Social-media plugin handles platform-specific API calls (LinkedIn, etc.)
- Response: `{ impressions, likes, comments, shares, platform }`

---

## Prerequisites

Before using this plugin:

1. **Cloudflare account**: Free account at cloudflare.com
2. **Terraform**: Cloudflare provider configured with API token
3. **Social metrics**: Social-media plugin installed (handles platform API calls via messaging)

---

## Terraform Infrastructure (Phase 2.5)

### Module Structure

```
apps/professional-brain/deploy/terraform-state/
├── modules/
│   ├── bunny-cdn/              # Existing
│   └── cloudflare-analytics/   # New
│       ├── main.tf
│       ├── variables.tf
│       └── outputs.tf
└── main.tf                     # Add cloudflare-analytics module call
```

### Cloudflare Analytics Module (`modules/cloudflare-analytics/main.tf`)

```hcl
terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

# Web Analytics site (for domains NOT on Cloudflare DNS)
resource "cloudflare_web_analytics_site" "main" {
  account_id   = var.cloudflare_account_id
  host         = var.domain
  auto_install = false  # We inject manually via site-builder
}

# Or for domains ON Cloudflare DNS, use zone_tag instead:
# resource "cloudflare_web_analytics_site" "main" {
#   account_id   = var.cloudflare_account_id
#   zone_tag     = var.cloudflare_zone_id
#   auto_install = true
# }
```

### Variables (`modules/cloudflare-analytics/variables.tf`)

```hcl
variable "cloudflare_account_id" {
  description = "Cloudflare account ID"
  type        = string
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token with Analytics permissions"
  type        = string
  sensitive   = true
}

variable "domain" {
  description = "Domain to track (e.g., yeehaa.io)"
  type        = string
}
```

### Outputs (`modules/cloudflare-analytics/outputs.tf`)

```hcl
output "site_tag" {
  value       = cloudflare_web_analytics_site.main.site_tag
  description = "Site tag for API queries"
}

output "site_token" {
  value       = cloudflare_web_analytics_site.main.site_token
  description = "Site token for tracking script"
  sensitive   = true
}

output "tracking_script" {
  value       = <<-EOT
    <script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "${cloudflare_web_analytics_site.main.site_token}"}'></script>
  EOT
  description = "Cloudflare Web Analytics tracking script for site-builder injection"
}

output "ruleset_id" {
  value       = cloudflare_web_analytics_site.main.ruleset_id
  description = "Ruleset ID for the analytics site"
}
```

### Site-Builder Integration

After Terraform provisions Cloudflare Analytics, the tracking script is injected via environment variable:

```typescript
// brain.config.ts
siteBuilderPlugin({
  // ... existing config
  analytics: {
    trackingScript: process.env["CLOUDFLARE_TRACKING_SCRIPT"],
  },
}),
```

The HeadCollector injects this script into the `<head>` of all pages.

---

## Verification

1. **Unit tests**: Mock Cloudflare GraphQL API and messaging responses, verify entity creation
2. **Integration test**: Use plugin harness
3. **Manual test**:
   - Run `terraform apply` to provision Cloudflare Web Analytics
   - Build site with tracking script injected
   - Visit site, verify beacon loads in Network tab
   - Wait for data in Cloudflare dashboard
   - Run `analytics_fetch_website` tool
   - Verify website-metrics entity created in data directory
   - Run `analytics_fetch_social` tool (requires published social posts)
   - Verify social-metrics entity created for each post
4. **Cron verification**: Start shell, wait for scheduled collection, check entities created
