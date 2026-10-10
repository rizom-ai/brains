---
"@rizom/brain": patch
---

Analytics injects its beacon only with `cloudflare.beaconToken` (`CLOUDFLARE_ANALYTICS_BEACON_TOKEN`), the Web Analytics site token; `siteTag` is only the metrics query filter. The beacon carried the site tag, which is not its token, and a proxied zone with automatic setup already gets the beacon from Cloudflare.
