---
"@brains/app": minor
"@rizom/brain": minor
"@rizom/ops": minor
---

Require `bundleContract: capability-bundles-v1` before resolving the canonical capability taxonomy so overlapping legacy bundle IDs cannot silently change meaning. Standalone migration now requires an explicitly reviewed recipe, while fleet crossover staging binds each expected pilot/cohort source selection to an exact target and preserves separately reviewed site/theme pins.
