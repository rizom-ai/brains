---
"@brains/utils": patch
---

Split the utils grab-bag into explicit subpath modules (@brains/utils/logger, /id, /markdown, /yaml, /progress, /string-utils, …) and delete the root barrel; the root export is now the pinned zod module only. All consumers import the specific module they use.
