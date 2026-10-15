---
"@rizom/brain": patch
---

Analytics contributes a Cloudflare beacon only when `cloudflare.beaconToken` is explicitly configured, independently of the `siteTag` metrics filter. Expose the optional public site token through `CLOUDFLARE_ANALYTICS_BEACON_TOKEN`; leave it unset when Cloudflare automatic setup supplies the beacon. Preserve declarative, worker-enabled build-time contributions and serialize token values safely as JSON inside the HTML attribute. No site-tag fallback, live setup, deployment or traffic-collection guarantee is added.
