# Analytics Plugin

Keeps the brain's site traffic from Cloudflare Web Analytics and answers traffic questions through `system_analytics`.

## Features

- **Daily snapshots**: a daily check stores each day's traffic in weekly `traffic-snapshot` entities (restricted, read-only system records) while Cloudflare's counts are still exact, and backfills every earlier day Cloudflare still returns
- **Traffic reports**: `traffic-overview`, `traffic-series` and `traffic-by-entity` in `system_analytics`, read from the snapshots
- **Privacy-Focused**: Uses Cloudflare Web Analytics (no cookies, GDPR compliant)

## Configuration

```typescript
import { analyticsPlugin } from "@brains/analytics";

analyticsPlugin({
  cloudflare: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    siteTag: process.env.CLOUDFLARE_ANALYTICS_SITE_TAG,
    // Only for a site without Cloudflare automatic setup
    beaconToken: process.env.CLOUDFLARE_ANALYTICS_BEACON_TOKEN,
  },
});
```

## Environment Variables

```bash
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_API_TOKEN=your_api_token  # Needs Analytics:Read permission
CLOUDFLARE_ANALYTICS_SITE_TAG=your_site_tag
CLOUDFLARE_ANALYTICS_BEACON_TOKEN=your_site_token  # Optional, see below
```

## Reports

Both reports answer admin callers only: traffic is operational data. They read the stored snapshots; a range that reaches today adds today's numbers so far from Cloudflare when it is configured.

**Range params** (both reports): `days` (last N days ending yesterday, default 7), or `startDate` and `endDate` together (`YYYY-MM-DD`).

### `traffic-overview`

Pageviews and visits for the range against the period before it, top pages, referrers and countries. The owner's own pages (`/studio`, `/login`, `/api`, `/dashboard`, …) are left out of the top pages and counted in `ownerPageviews`. `missingDays` names days without a snapshot; `estimated` says some days were sampled by Cloudflare. Extra param: `limit` (entries per top list, default 10).

```typescript
system_analytics({ type: "traffic-overview", params: { days: 30 } });
```

### `traffic-series`

Pageviews and visits per day (missing days without numbers) or per ISO week. Extra param: `interval` (`day` or `week`, default `day`).

```typescript
system_analytics({
  type: "traffic-series",
  params: { startDate: "2026-09-01", endDate: "2026-09-30", interval: "week" },
});
```

### `traffic-by-entity`

Pageviews per published piece over the range, busiest first, with each piece's top referrers. Pieces are the public, published entities of every type the site has pages for, each matched to its page through the site's entity display (the same routes the site builds). Extra params: `entityType` (one type), `limit` (default 10), `firstDays` (also count views in the first N days after `publishedAt`). Counts come from each day's top 25 pages, so a quiet page can read low.

```typescript
system_analytics({
  type: "traffic-by-entity",
  params: { entityType: "post", days: 30, firstDays: 7 },
});
```

## Studio

- **Traffic workspace** (admin): the last 7, 30 or 90 days — pageviews and visits against the period before, the busiest day, the owner's own pageviews counted apart, a daily chart with publish dates marked, the most-read published pieces (opening their entities), top pages, referrers and countries.
- **Traffic widget** (dashboard, admin): the last 7 days against the 7 before, with a link into the workspace.

## Infrastructure Setup

Create a Cloudflare Web Analytics site for your domain in the Cloudflare dashboard (Analytics & Logs → Web Analytics) and give the brain its **site tag** in `CLOUDFLARE_ANALYTICS_SITE_TAG`; the metrics queries filter on it.

The tracking beacon carries a different value, the **site token**:

- **Automatic setup** (the domain is proxied through Cloudflare): Cloudflare injects the beacon itself. Leave `CLOUDFLARE_ANALYTICS_BEACON_TOKEN` unset.
- **Manual setup**: set `CLOUDFLARE_ANALYTICS_BEACON_TOKEN` to the site token (the `token` in the JS snippet), and the brain adds the beacon to every page it builds.

Both values are listed by `GET /accounts/{account_id}/rum/site_info/list` as `site_tag` and `site_token`.

## Dependencies

- Uses Cloudflare GraphQL API for website metrics
