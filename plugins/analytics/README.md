# Analytics Plugin

Collects and stores website metrics from Cloudflare Web Analytics.

## Features

- **Website Analytics**: Fetches metrics from Cloudflare Web Analytics (pageviews, visitors, top pages, referrers, devices, countries)
- **Scheduled Collection**: Automatic daily data collection via cron
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

  // Custom cron schedule (optional)
  cron: {
    websiteMetrics: "0 2 * * *", // Daily at 2 AM (default)
  },
});
```

## Environment Variables

```bash
# Cloudflare Web Analytics
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_API_TOKEN=your_api_token  # Needs Analytics:Read permission
CLOUDFLARE_ANALYTICS_SITE_TAG=your_site_tag
```

## MCP Tools

| Tool                           | Description                                       |
| ------------------------------ | ------------------------------------------------- |
| `analytics_fetch_website`      | Fetch metrics from Cloudflare and store as entity |
| `analytics_get_website_trends` | Query stored website metrics                      |

## Entity Types

### `website-metrics`

Daily snapshots of website traffic with breakdowns.

```typescript
{
  id: "website-metrics-2025-01-15",
  entityType: "website-metrics",
  metadata: {
    date: "2025-01-15",
    pageviews: 1500,
    visitors: 450,
  }
}
```

Frontmatter includes additional breakdowns:

- `topPages`: Array of `{ path, views }`
- `topReferrers`: Array of `{ host, visits }`
- `devices`: Object with `{ desktop, mobile, tablet }` percentages
- `topCountries`: Array of `{ country, visits }`

## Scheduled Collection

When configured, the plugin automatically collects metrics on a schedule:

- **Website metrics**: Daily at 2 AM (collects yesterday's data)

The schedule is customizable via the `cron` config option.

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

- Uses Cloudflare GraphQL API for website metrics
