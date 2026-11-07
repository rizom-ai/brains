---
"@rizom/brain": patch
---

`defineEntity` accepts `projectionRules`, which derive entities of the type from many sources through the brain's projection runtime, with a function form that hands a rule the registered names of the type's templates. A declared rule writes its own type only, and is given bound reads and generation rather than the services behind them. `@rizom/brain/entities` exports `defineProjectionRule`, `ProjectionRule`, `ProjectionRuleDefinition`, `ProjectionWriteIntent`, `ProjectionJsonObject` and `ProjectionJsonObjectSchema`; a projection rule's reads and generation are now typed without the entity service and AI namespace behind them.
