---
"@brains/utils": patch
---

Split the utils grab-bag into explicit subpath modules (@brains/utils/logger, /id, /markdown, /yaml, /progress, /string-utils, …) and delete the root barrel; the pinned zod re-export lives at @brains/utils/zod and the package root exports nothing. All consumers import the specific module they use.
