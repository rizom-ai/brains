---
"@brains/conflict": patch
"@brains/contracts": patch
"@brains/directory-sync": patch
"@rizom/brain": patch
---

A file in `brain-data/` edited while its entry also changed in the brain no longer loses silently, and no longer overwrites the newer entry. Directory sync now records the version a file and its entry last agreed on. An edited file over an unchanged entry imports as before; when both changed, the entry stays, the file's text is kept as a conflict in the Inbox, and the file is rewritten with the brain's version. From the Inbox the losing version can be applied over the current one or dismissed, with a diff between the two. A file that was removed while its entry changed deletes nothing and is written back. The new `conflict` entity type is part of the core bundle; it is never public, stays out of search, and cannot be written from Studio, chat or MCP. Directory sync refuses to start in a brain without it.
