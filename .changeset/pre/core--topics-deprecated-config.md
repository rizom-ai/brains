---
"@rizom/brain": patch
---

The topics plugin no longer has the deprecated `includeEntityTypes`, `sourceWeights`, `mintableEntityTypes` and `mergeSimilarityThreshold` config fields. Topics are drawn from every projection source not named in `excludeEntityTypes`, each weighted and given mint authority by its source role (`sourceRolePolicies`, `sourceRoleOverrides`), and automatic merging uses `semanticMergeDistance`. A brain config that still sets one of the four fields boots, and the field has no effect.
