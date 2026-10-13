---
"@rizom/brain": patch
---

Studio and web chat answer a failure of their own (a workspace that cannot load its data, an upload that cannot be promoted, an agent or runtime action answer that does not parse) with 500 instead of 502. A proxy in front of the brain, such as Cloudflare, replaces an origin 502 with its own page, so the reason never reached Studio.
