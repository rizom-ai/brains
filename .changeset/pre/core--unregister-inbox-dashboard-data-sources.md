---
"@rizom/brain": patch
---

The Unified Inbox and Dashboard no longer register their aggregates as shared data sources. Nothing read them through the registry, and the Inbox aggregate ignored who was asking, so any template or package that fetched `unified-inbox:inbox` could have received admin inbox items.
