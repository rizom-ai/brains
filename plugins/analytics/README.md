# Analytics Plugin

Query website analytics directly from Cloudflare Web Analytics.

## Features

- **Real-time Queries**: Fetch metrics directly from Cloudflare (no local storage)
- **Flexible Date Ranges**: Single day, last N days, or custom date ranges
- **Comprehensive Data**: Pageviews, visitors, top pages, referrers, devices, countries
- **Privacy-Focused**: Uses Cloudflare Web Analytics (no cookies, GDPR compliant)

## Configuration

Configure the Analytics package in your canonical `brain.yaml`:

```yaml
add: [analytics]
plugins:
  analytics:
    cloudflare:
      accountId: ${CLOUDFLARE_ACCOUNT_ID}
      apiToken: ${CLOUDFLARE_API_TOKEN}
      siteTag: ${CLOUDFLARE_ANALYTICS_SITE_TAG}
      # Only for manual beacon setup; omit this line for automatic setup.
      beaconToken: ${CLOUDFLARE_ANALYTICS_BEACON_TOKEN}
```

These environment variables are consumed through configuration interpolation,
not read directly by the plugin.

## Environment Variables

```bash
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_API_TOKEN=your_api_token  # Needs Analytics:Read permission
CLOUDFLARE_ANALYTICS_SITE_TAG=your_site_tag
CLOUDFLARE_ANALYTICS_BEACON_TOKEN=your_public_site_token  # Optional
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

The **site tag** (`CLOUDFLARE_ANALYTICS_SITE_TAG`) filters Cloudflare Web Analytics metrics queries. It is not a tracking token.

The tracking beacon uses the separate, public **site token**:

- **Automatic setup enabled in Cloudflare**: leave `beaconToken` unset. The Brain adds no beacon; it does not detect or verify Cloudflare's edge injection.
- **Manual setup**: configure `beaconToken` through `CLOUDFLARE_ANALYTICS_BEACON_TOKEN` using the `token` from the Web Analytics JavaScript snippet. The Brain contributes one beacon per build through its worker-enabled head-script subscription.

Both values are available in Cloudflare's Web Analytics site configuration and as `site_tag` / `site_token` from `GET /accounts/{account_id}/rum/site_info/list`. The site token is intentionally published in HTML; never use the private API token as `beaconToken`. An absent or empty beacon token contributes nothing. There is no fallback to the site tag.

This configuration does not enable Cloudflare automatic setup, detect another injector, deploy pages or verify traffic collection. Configure only one injector to avoid duplicate tracking.

## Dependencies

- Uses Cloudflare GraphQL API for website metrics
