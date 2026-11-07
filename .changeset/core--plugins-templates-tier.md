---
"@brains/sdk": patch
"@rizom/brain": patch
---

`@rizom/brain/plugins` and `@rizom/brain/templates` drop the advanced alpha names no declarative package uses: the agent, app-info, runtime-readiness, conversation, identity, extension-metadata, messaging and channel contracts, and the template and site-builder types. `@rizom/brain/plugins` keeps `PluginPackageDefinition`, which the root entry also exports, and `Resource` and `Tool`; `@rizom/brain/templates` keeps `createTemplate`. Those three remain only for packages written against the alpha class API, until it is removed.
