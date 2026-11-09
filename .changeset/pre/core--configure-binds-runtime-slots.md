---
"@rizom/brain": patch
---

An entity package's `configure` can now bind an entity's `publish` provider, `projectionRules`, `jobs` and `generation` from the package's config, as it binds `create` and `evals`. For example, a provider or a job can read an API token. A binding that names a slot `configure` does not bind is refused when the package is instantiated; before, it was silently ignored.
