---
"@rizom/brain": patch
---

A first-party service converted from a class keeps its tools' snake-case names, such as `atproto-registry_check_contracts`, through an internal helper. The public `defineTool` keeps its kebab-case rule.
