---
"@rizom/brain": patch
---

Fix the shared local env helper so browser-targeted `@rizom/brain` builds do not depend on `node:util.parseEnv`.
