# @brains/webdav

## 0.2.0-alpha.748

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.748
  - @brains/contracts@0.2.0-alpha.748
  - @brains/entity-placement@0.2.0-alpha.748
  - @brains/image@0.2.0-alpha.748
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
  - @brains/entity-placement@0.2.0-alpha.747
  - @brains/image@0.2.0-alpha.747

## 0.2.0-alpha.746

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.746
  - @brains/contracts@0.2.0-alpha.746
  - @brains/entity-placement@0.2.0-alpha.746
  - @brains/image@0.2.0-alpha.746
  - @brains/utils@0.2.0-alpha.746

## 0.2.0-alpha.745

### Patch Changes

- Updated dependencies [[`f0bee6f`](https://github.com/rizom-ai/brains/commit/f0bee6f03f08ef0be00b1cd9eacfbf5393c3fb40), [`0875c14`](https://github.com/rizom-ai/brains/commit/0875c14c126c95e76cc5c9df7401a44412a4ef9b)]:
  - @brains/image@0.2.0-alpha.745
  - @brains/contracts@0.2.0-alpha.745
  - @brains/sdk@0.2.0-alpha.745
  - @brains/entity-placement@0.2.0-alpha.745
  - @brains/utils@0.2.0-alpha.745

## 0.2.0-alpha.744

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.744
  - @brains/contracts@0.2.0-alpha.744
  - @brains/entity-placement@0.2.0-alpha.744
  - @brains/image@0.2.0-alpha.744
  - @brains/utils@0.2.0-alpha.744

## 0.2.0-alpha.743

### Patch Changes

- [#999](https://github.com/rizom-ai/brains/pull/999) [`b48bf16`](https://github.com/rizom-ai/brains/commit/b48bf16951bd8797544eb434b9d7ccaff4e3c57e) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Saving a file through an rclone mount no longer deletes it when the drive refuses the save or stores it in another form. rclone takes such a save as a failed upload and deletes the file to clean up; the drive now answers that one delete with 409 and keeps the entity. A second delete, or one naming the version with `If-Match`, still deletes the file.

- [#999](https://github.com/rizom-ai/brains/pull/999) [`8f34251`](https://github.com/rizom-ai/brains/commit/8f34251336ae411b94d7afd3f8e36b2b74bfadbe) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Saving a file on the drive with neovim no longer deletes it. neovim renames the file to its backup name (`note.md~`) before writing it anew, and when the drive refused that rename it copied the file and deleted the original, which deleted the entity. A rename of an entity's file onto a temporary name is now taken as that backup: the bytes are copied to the person's temporary files and the entity stays, for the save that follows to replace.
- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.743
  - @brains/contracts@0.2.0-alpha.743
  - @brains/entity-placement@0.2.0-alpha.743
  - @brains/image@0.2.0-alpha.743
  - @brains/utils@0.2.0-alpha.743

## 0.2.0-alpha.742

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.742
  - @brains/entity-placement@0.2.0-alpha.742
  - @brains/image@0.2.0-alpha.742
  - @brains/contracts@0.2.0-alpha.742
  - @brains/utils@0.2.0-alpha.742

## 0.2.0-alpha.741

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.741
  - @brains/contracts@0.2.0-alpha.741
  - @brains/entity-placement@0.2.0-alpha.741
  - @brains/image@0.2.0-alpha.741
  - @brains/utils@0.2.0-alpha.741

## 0.2.0-alpha.740

### Patch Changes

- [#997](https://github.com/rizom-ai/brains/pull/997) [`7fa12e5`](https://github.com/rizom-ai/brains/commit/7fa12e5f8fc9f1b1fa023445f45305125de49614) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Connecting the drive from macOS no longer reports "operation not permitted". The hidden folders a desktop makes on a mounted volume (`.Trashes`, `.TemporaryItems`, `.Spotlight-V100`), at the top of the drive or inside any folder, and every file inside them, are temporary items held per person in memory, never entities. A property change (`PROPPATCH`), which macOS and Windows send after a save, is accepted and stores nothing instead of answering 403.
- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.740
  - @brains/contracts@0.2.0-alpha.740
  - @brains/entity-placement@0.2.0-alpha.740
  - @brains/image@0.2.0-alpha.740
  - @brains/utils@0.2.0-alpha.740

## 0.2.0-alpha.739

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.739
  - @brains/contracts@0.2.0-alpha.739
  - @brains/entity-placement@0.2.0-alpha.739
  - @brains/image@0.2.0-alpha.739
  - @brains/utils@0.2.0-alpha.739

## 0.2.0-alpha.738

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.738
  - @brains/contracts@0.2.0-alpha.738
  - @brains/entity-placement@0.2.0-alpha.738
  - @brains/image@0.2.0-alpha.738
  - @brains/utils@0.2.0-alpha.738

## 0.2.0-alpha.737

### Patch Changes

- Updated dependencies []:
  - @brains/sdk@0.2.0-alpha.737
  - @brains/contracts@0.2.0-alpha.737
  - @brains/entity-placement@0.2.0-alpha.737
  - @brains/image@0.2.0-alpha.737
  - @brains/utils@0.2.0-alpha.737

## 0.2.0-alpha.736

### Patch Changes

- [#990](https://github.com/rizom-ai/brains/pull/990) [`1692317`](https://github.com/rizom-ai/brains/commit/16923178f2424787d96961720f56f0a0ebaa1ab2) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A brain can be mounted as a network drive. The new opt-in `webdav` plugin (`add: [webdav]`) serves the brain's entities over WebDAV on `/dav`, as the folders and files `brain-data/` holds, at the visibility of the person signed in: anything they may not see is not listed and answers 404. A mount signs in with an app password, created in Studio under Account → Drive: a generated username and password shown once, read-only unless saving is allowed when it is created, valid for the drive only, expiring after a year, revocable, and refused over plain HTTP except on localhost. Saving, creating and deleting a markdown file through the drive go through the type's validation, the entity action and visibility policies and a stale-write check, as a Studio edit does; an image file in `image/` is stored as an asset with its image entity, as a file imported from `brain-data/` is; editors' temporary files and new empty folders are held per person in memory and never become entities. The drive offers WebDAV class 2 locks, which macOS Finder and Windows need to mount it writable. Renaming files and saving documents are not offered. The tab shows the drive address and the steps for GNOME Files and rclone. Web routes may now declare `HEAD` and the WebDAV methods, and entity file placement moved from directory-sync into the shared `@brains/entity-placement` package with no change to any path.
- Updated dependencies [[`1692317`](https://github.com/rizom-ai/brains/commit/16923178f2424787d96961720f56f0a0ebaa1ab2)]:
  - @brains/entity-placement@0.2.0-alpha.736
  - @brains/contracts@0.2.0-alpha.736
  - @brains/sdk@0.2.0-alpha.736
  - @brains/image@0.2.0-alpha.736
  - @brains/utils@0.2.0-alpha.736
