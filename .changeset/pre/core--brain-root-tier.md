---
"@brains/sdk": patch
"@rizom/brain": patch
---

`@rizom/brain` no longer exports `BrainMode`, which no author signature names. The brain-definition fixture's canary writes every field a brain definition freezes through its own exported type, and the fixture now compiles with the other public-authoring packages.
