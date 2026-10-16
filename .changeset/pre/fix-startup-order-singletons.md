---
"@brains/core": patch
"@brains/entity-service": patch
"@brains/identity-service": patch
"@brains/site-info": patch
---

Fix startup ordering so the webserver listens before heavy initial sync and singleton defaults are only created after initial content imports have had a chance to populate existing brain-data.

This prevents cold starts with an empty runtime database from writing default anchor-profile, brain-character, or site-info entities over real markdown content, while preserving default creation for truly empty brains.
