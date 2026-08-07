---
"@rizom/brain": patch
---

Introduce schema-backed package definitions, typed `use()` composition, object-referenced bundles, and declarative entity packages for the stable `0.2` authoring API. Entity definitions now compose runtime fields, generated markdown adapters, optional typed codecs, and scheduler-owned projections. Installed package metadata and peer compatibility are resolved by the loader, including external brain definitions booted from packed artifacts.

This intentionally removes alpha-only root and plugin authoring exports including `PLUGIN_API_VERSION`, class-first plugin APIs, tuple/factory contracts, factory package loading, and the root Zod convenience export. Family authoring entries own their blessed schema helpers.
