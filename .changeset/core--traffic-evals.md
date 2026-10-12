---
"@rizom/brain": patch
---

The analytics plugin runs in evals: its reports read stored snapshots and need no Cloudflare, so traffic questions are covered by eval cases (`traffic-overview` for a traffic question, `traffic-by-entity` with `firstDays` for how a piece did after publishing).
