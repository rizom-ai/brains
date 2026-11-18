---
"@brains/conflict": patch
"@brains/contracts": patch
"@brains/agent-discovery": patch
"@brains/content-pipeline": patch
"@brains/directory-sync": patch
"@brains/email-workflows": patch
"@brains/stock-photo": patch
"@brains/topics": patch
"@brains/utils": patch
"@brains/studio": patch
"@brains/webdav": patch
"@rizom/brain": patch
---

A file in `brain-data/` edited while its entry also changed in the brain no longer loses silently, and no longer overwrites the newer entry. Directory sync now records the version a file and its entry last agreed on. An edited file over an unchanged entry imports as before; when both changed, the entry stays, the file's text is kept as a conflict in the Inbox, and the file is rewritten with the brain's version. From the Inbox the losing version can be applied over the current one or dismissed, with a diff between the two. A file that was removed while its entry changed deletes nothing and is written back. The new `conflict` entity type is part of the core bundle; it is never public, stays out of search, and cannot be written from Studio, chat or MCP. Directory sync refuses to start in a brain without it.

A git pull no longer lets the remote overwrite what the brain changed. Changes to different parts of a file merge; where both changed the same lines the brain's version stays and the remote's is kept as a conflict in the Inbox. A file the remote deleted while the brain changed it is kept. A checkout that shares no history with its remote still takes the remote's version.

A drive save that names no version (rclone, Finder, Explorer) is now based on the version that mount last read or saved. Over a newer version it is kept as a conflict and answered as saved, so the client does not retry it and the newer version is not overwritten; a delete over a newer version is refused with 409. Saves that name their version with `If-Match` still get 412. The drive refuses to start in a brain without the `conflict` type.

A Studio save over a version that changed since the editor opened it is kept as a conflict in the Inbox before it is refused, so closing the tab no longer loses it. The save and its version check are now one write, and a save that names no version is refused. A save that changes nothing stays a save.

Background work no longer overwrites an edit made while it was running. Recording a completed or failed publish, setting a stock photo as cover, numbering mail in a thread, refreshing or archiving a discovered agent and merging directory introducers now write only over the version they read, and make their change again on the current version when it moved on. A topic merge synthesized from a version that changed since is dropped and reviewed again on a later run.

An image saved over a newer image, as a file in `brain-data/` or through the drive, is kept in the Inbox too: the brain keeps its image, the Inbox names both, and the other one can be applied or dismissed. A losing image is held in a second type, `conflict-image`, which has no file in `brain-data/`.
