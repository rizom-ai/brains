---
"@rizom/brain": minor
---

Traffic is asked through `system_analytics`: `traffic-overview` (pageviews and visits against the period before, top pages without the owner's own pages, referrers, countries, days missing or sampled) and `traffic-series` (per day or ISO week) read the brain's traffic snapshots, admin callers only, with today's numbers so far added from Cloudflare when a range reaches today. `analytics_query` is removed.
