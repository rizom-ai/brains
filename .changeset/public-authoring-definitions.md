---
"@rizom/brain": patch
---

Introduce schema-backed package definitions, typed `use()` composition, object-referenced bundles, and declarative entity packages for the stable `0.2` authoring API. Entity definitions now compose runtime fields, generated markdown adapters, optional typed codecs, and scheduler-owned projections. Installed package metadata and peer compatibility are resolved by the loader, including external brain definitions booted from packed artifacts.

Bundled instances can explicitly disable provider-backed semantic indexing while retaining lexical full-text search. Exact bundled tool invocation supports structured input, generated confirmation replay, and explicit permission scopes.

Declarative service packages now infer setup state and config, expose schema-first tools with plain typed output, and register durable typed jobs with queue-owned retries, deadlines, progress, cancellation, status, and restart recovery. Resources, prompts, templates, views, and cleanup remain lifecycle-owned.

`@rizom/site` is now the sole site-authoring SDK, with canonical `defineSite()`, schema-first sections, a blessed schema vocabulary, initial content validation, and runtime-derived structural validation. App-managed builds preserve package CSS, global head scripts, and static assets. The removed alpha `@rizom/brain/site` subpath and `@rizom/site-sections` workspace package have no compatibility facade.

This intentionally removes alpha-only root and plugin authoring exports including `PLUGIN_API_VERSION`, class-first plugin APIs, tuple/factory contracts, factory package loading, and the root Zod convenience export. Family authoring entries own their blessed schema helpers.
