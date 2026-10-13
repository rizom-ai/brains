---
"@rizom/brain": patch
---

Analytics captures site traffic into weekly `traffic-snapshot` entities: a daily check stores yesterday's Cloudflare counts per day (pageviews, visits, top paths, referrers, path × referrer pairs, countries) while they are exact, refreshes the last three days, and on its first run backfills every day Cloudflare still returns, marking sampled days as estimates. Snapshots are restricted and stay out of search and embeddings; a failed capture raises an alert.
