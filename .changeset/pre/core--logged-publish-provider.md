---
"@rizom/brain": patch
---

A first-party entity type's publish provider can be built with the plugin's logger when it is handed to the publish pipeline, as an entity plugin class built its client with a child of its own logger, so a provider bound from the package's config logs where the plugin logs.
