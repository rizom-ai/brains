---
"@rizom/brain": patch
---

Operator views no longer emit the old `declarative-*` and `operator-*` class names (`declarative-detail-master`, `declarative-columns`, `operator-key-values`, `declarative-card` and others); no stylesheet read them. Their elements carry data attributes instead (`data-detail-master`, `data-columns`, `data-facts`, `data-card`, …), alongside the existing `data-block` and `data-operator-blocks`. Disclosures keep their class hooks, which are passed through the host component's `className`.
