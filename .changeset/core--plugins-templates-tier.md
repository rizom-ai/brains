---
"@brains/sdk": patch
"@rizom/brain": patch
---

The `@rizom/brain/plugins` and `@rizom/brain/templates` subpaths are removed. No declarative package used their advanced alpha names: the agent, app-info, runtime-readiness, conversation, identity, extension-metadata, messaging and channel contracts, and the template and site-builder types. `PluginPackageDefinition` stays on the root entry. The packages written against the alpha class API that still imported `Resource`, `Tool` and `createTemplate` already stopped working when the class bases left the public entries.
