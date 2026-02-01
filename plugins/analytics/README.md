# Analytics Plugin

Query website analytics directly from Cloudflare Web Analytics.

## Features

- **Real-time Queries**: Fetch metrics directly from Cloudflare (no local storage)
- **Flexible Date Ranges**: Single day, last N days, or custom date ranges
- **Comprehensive Data**: Pageviews, visitors, top pages, referrers, devices, countries
- **Privacy-Focused**: Uses Cloudflare Web Analytics (no cookies, GDPR compliant)

## Configuration

```typescript
import { analyticsPlugin } from "@brains/analytics";

analyticsPlugin({
  cloudflare: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    siteTag: process.env.CLOUDFLARE_ANALYTICS_SITE_TAG,
  },
});
```

## Environment Variables

```bash
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_API_TOKEN=your_api_token  # Needs Analytics:Read permission
CLOUDFLARE_ANALYTICS_SITE_TAG=your_site_tag
```

## MCP Tools

### `analytics_query`

Query website analytics from Cloudflare.

**Date range options** (use only one):

- No params: yesterday only
- `date`: single specific day (YYYY-MM-DD)
- `days`: last N days from yesterday (e.g., 7 for last week, 30 for last month)
- `startDate` + `endDate`: custom date range

**Parameters:**

- `date` (optional): Single date in YYYY-MM-DD format
- `days` (optional): Number of days back from yesterday (1-365)
- `startDate` (optional): Start date for custom range
- `endDate` (optional): End date for custom range
- `limit` (optional): Max items for breakdowns (default: 20, max: 100)

**Returns:**

```typescript
{
  range: { startDate: string, endDate: string },
  summary: { pageviews: number, visitors: number },
  topPages: Array<{ path: string, views: number }>,
  topReferrers: Array<{ host: string, visits: number }>,
  devices: { desktop: number, mobile: number, tablet: number },
  topCountries: Array<{ country: string, visits: number }>,
}
```

**Examples:**

```typescript
// Yesterday's stats
analytics_query({});

// Specific day
analytics_query({ date: "2025-01-15" });

// Last 7 days
analytics_query({ days: 7 });

// Last 30 days with more results
analytics_query({ days: 30, limit: 50 });

// Custom date range
analytics_query({ startDate: "2025-01-01", endDate: "2025-01-31" });
```

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
