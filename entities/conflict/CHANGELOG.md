# @brains/conflict

## 0.2.0-alpha.756

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.756
  - @brains/contracts@0.2.0-alpha.756
  - @brains/utils@0.2.0-alpha.756

## 0.2.0-alpha.755

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.755
  - @brains/contracts@0.2.0-alpha.755
  - @brains/utils@0.2.0-alpha.755

## 0.2.0-alpha.754

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.754
  - @brains/contracts@0.2.0-alpha.754
  - @brains/utils@0.2.0-alpha.754

## 0.2.0-alpha.753

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.753
  - @brains/contracts@0.2.0-alpha.753
  - @brains/utils@0.2.0-alpha.753

## 0.2.0-alpha.752

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.752
  - @brains/contracts@0.2.0-alpha.752
  - @brains/utils@0.2.0-alpha.752

## 0.2.0-alpha.751

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.751
  - @brains/contracts@0.2.0-alpha.751
  - @brains/utils@0.2.0-alpha.751

## 0.2.0-alpha.750

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.750
  - @brains/contracts@0.2.0-alpha.750
  - @brains/utils@0.2.0-alpha.750

## 0.2.0-alpha.749

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.749
  - @brains/contracts@0.2.0-alpha.749
  - @brains/utils@0.2.0-alpha.749

## 0.2.0-alpha.748

### Patch Changes

- [#1007](https://github.com/rizom-ai/brains/pull/1007) [`1769bfb`](https://github.com/rizom-ai/brains/commit/1769bfbdf261b5e966d9dd831a81ae8b691fe686) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The agent's entity-type list leaves out a type that no system tool can write or find, such as conflicts and traffic snapshots, which their own Inbox or analytics tools handle. A conflict's description no longer says only an admin resolves it: whoever made the edit settles it from the editor, and an admin settles any conflict from the Inbox.
- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.748
  - @brains/contracts@0.2.0-alpha.748
  - @brains/utils@0.2.0-alpha.748

## 0.2.0-alpha.747

### Patch Changes

- [#1003](https://github.com/rizom-ai/brains/pull/1003) [`2aaa9d1`](https://github.com/rizom-ai/brains/commit/2aaa9d14fb6facf57d4767663729d8e983428f9a) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A file in `brain-data/` edited while its entry also changed in the brain no longer loses silently, and no longer overwrites the newer entry. Directory sync now records the version a file and its entry last agreed on. An edited file over an unchanged entry imports as before; when both changed, the entry stays, the file's text is kept as a conflict in the Inbox, and the file is rewritten with the brain's version. From the Inbox the losing version can be applied over the current one or dismissed, with a diff between the two. A file that was removed while its entry changed deletes nothing and is written back. The new `conflict` entity type is part of the core bundle; it is never public, stays out of search, and cannot be written from Studio, chat or MCP. Directory sync refuses to start in a brain without it.

  A git pull no longer lets the remote overwrite what the brain changed. Changes to different parts of a file merge; where both changed the same lines the brain's version stays and the remote's is kept as a conflict in the Inbox. A file the remote deleted while the brain changed it is kept. A checkout that shares no history with its remote still takes the remote's version.

  A drive save that names no version (rclone, Finder, Explorer) is now based on the version that mount last read or saved. Over a newer version it is kept as a conflict and answered as saved, so the client does not retry it and the newer version is not overwritten; a delete over a newer version is refused with 409. Saves that name their version with `If-Match` still get 412. The drive refuses to start in a brain without the `conflict` type.

  A Studio save over a version that changed since the editor opened it is kept as a conflict in the Inbox before it is refused, so closing the tab no longer loses it. The save and its version check are now one write, and a save that names no version is refused. A save that changes nothing stays a save.

  Background work no longer overwrites an edit made while it was running. Recording a completed or failed publish, setting a stock photo as cover, numbering mail in a thread, refreshing or archiving a discovered agent and merging directory introducers now write only over the version they read, and make their change again on the current version when it moved on. A topic merge synthesized from a version that changed since is dropped and reviewed again on a later run.

  An image file in `brain-data/` or an image saved through the drive never replaces a newer image the brain holds: the file is put back as the brain's image, and the drive refuses the save.

  From the editor's comparison, the person whose save was refused can settle it there: save their kept version over the latest, or take the latest, which removes the conflict from the Inbox. An editor can resolve only a conflict that holds their own save; an admin can resolve any.

- Updated dependencies [[`2aaa9d1`](https://github.com/rizom-ai/brains/commit/2aaa9d14fb6facf57d4767663729d8e983428f9a)]:
  - @brains/contracts@0.2.0-alpha.747
  - @brains/utils@0.2.0-alpha.747
  - @brains/sdk@0.2.0-alpha.747
