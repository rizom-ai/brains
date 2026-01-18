# Analytics Plugin

Collects and stores website and social media metrics from external providers.

## Features

- **Website Analytics**: Fetches metrics from Cloudflare Web Analytics (pageviews, visitors, bounce rate, etc.)
- **Social Analytics**: Fetches engagement metrics from LinkedIn (impressions, likes, comments, shares)
- **Scheduled Collection**: Automatic daily/periodic data collection via cron
- **Entity Storage**: Metrics stored as entities for querying and historical analysis

## Configuration

```typescript
import { analyticsPlugin } from "@brains/analytics";

analyticsPlugin({
  // Cloudflare Web Analytics (optional)
  cloudflare: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    siteTag: process.env.CLOUDFLARE_ANALYTICS_SITE_TAG,
  },

  // LinkedIn Analytics (optional)
  linkedin: {
    accessToken: process.env.LINKEDIN_ACCESS_TOKEN,
  },

  // Custom cron schedules (optional)
  cron: {
    websiteMetrics: "0 2 * * *", // Daily at 2 AM (default)
    socialMetrics: "0 */6 * * *", // Every 6 hours (default)
  },
});
```

## Environment Variables

```bash
# Cloudflare Web Analytics
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_API_TOKEN=your_api_token  # Needs Analytics:Read permission
CLOUDFLARE_ANALYTICS_SITE_TAG=your_site_tag

# LinkedIn (uses social-media plugin credentials or separate token)
LINKEDIN_ACCESS_TOKEN=your_access_token
```

## MCP Tools

### Website Tools (requires Cloudflare config)

| Tool                           | Description                                       |
| ------------------------------ | ------------------------------------------------- |
| `analytics_fetch_website`      | Fetch metrics from Cloudflare and store as entity |
| `analytics_get_website_trends` | Query stored website metrics                      |

### Social Tools (requires LinkedIn config)

| Tool                           | Description                                   |
| ------------------------------ | --------------------------------------------- |
| `analytics_fetch_social`       | Fetch LinkedIn engagement for published posts |
| `analytics_get_social_summary` | Query stored social metrics with totals       |

## Entity Types

### `website-metrics`

Daily/weekly/monthly snapshots of website traffic.

```typescript
{
  id: "website-metrics-daily-2025-01-15",
  entityType: "website-metrics",
  metadata: {
    period: "daily" | "weekly" | "monthly",
    startDate: "2025-01-15",
    endDate: "2025-01-15",
    pageviews: 1500,
    visitors: 450,
    visits: 600,
    bounces: 180,
    totalTime: 27000,  // seconds
    bounceRate: 0.3,   // computed
    avgTimeOnPage: 45, // computed
  }
}
```

### `social-metrics`

Per-post engagement metrics from LinkedIn.

```typescript
{
  id: "social-metrics-urn-li-ugcPost-123",
  entityType: "social-metrics",
  metadata: {
    platform: "linkedin",
    entityId: "social-post-my-post",  // Reference to social-post entity
    platformPostId: "urn:li:ugcPost:123",
    snapshotDate: "2025-01-15T10:00:00.000Z",
    impressions: 5000,
    likes: 150,
    comments: 25,
    shares: 10,
    engagementRate: 0.037,  // computed
  }
}
```

## Scheduled Collection

When configured, the plugin automatically collects metrics on a schedule:

- **Website metrics**: Daily at 2 AM (collects yesterday's data)
- **Social metrics**: Every 6 hours (updates all published posts)

Schedules are customizable via the `cron` config option.

## Infrastructure Setup

The Cloudflare Web Analytics site is provisioned via Terraform:

```hcl
module "cloudflare_analytics" {
  source = "./modules/cloudflare-analytics"

  cloudflare_account_id = var.cloudflare_account_id
  cloudflare_api_token  = var.cloudflare_api_token
  domain                = "yourdomain.com"
}
```

The module outputs:

- `site_tag` - For API queries
- `site_token` - For the tracking script
- `tracking_script` - Ready-to-inject HTML script tag

## Dependencies

- **Soft dependency** on `social-media` plugin for `social-post` entities
- Uses Cloudflare GraphQL API for website metrics
- Uses LinkedIn Marketing API for social metrics
