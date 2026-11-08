---
"@rizom/brain": patch
---

Profile is a declarative service and the steward of the brain's identity. It registers the built-in profile kinds, extends the anchor profile with the selected kind's fields and validates every anchor write, and seeds or migrates the starter identity, as before, under the same `profile` plugin and config. It now answers `@brains/profile:import-preview` and `@brains/profile:import-apply`, through which another package fills the anchor profile: what the owner wrote is kept, an import is refused as a conflict once the profile changed after its preview, and only the plugins named in profile's new `importers` setting (default `linkedin-import`) may ask.
