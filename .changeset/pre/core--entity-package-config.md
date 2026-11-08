---
"@rizom/brain": patch
---

An entity package can take settings. `defineEntityPackage({ config, configure })` declares them as an object schema, and `use()`, a bundle's config and a brain's config give their values, checked by that schema. `configure({ config })` runs once each time the package is instantiated and binds what reads them: data sources that join the package's static ones under the same checks, and an entity's `create` routing or `evals` (`EntityPackageConfiguration`, `EntitySlotBinding`). A binding for an entity outside the package, the same entity twice, or a slot the entity already declares is refused. A package without `config` takes none, as before.
