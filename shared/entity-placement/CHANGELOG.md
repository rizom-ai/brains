# @brains/entity-placement

## 0.2.0-alpha.737

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.737
  - @brains/entity-service@0.2.0-alpha.737

## 0.2.0-alpha.736

### Patch Changes

- [#990](https://github.com/rizom-ai/brains/pull/990) [`1692317`](https://github.com/rizom-ai/brains/commit/16923178f2424787d96961720f56f0a0ebaa1ab2) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A brain can be mounted as a network drive. The new opt-in `webdav` plugin (`add: [webdav]`) serves the brain's entities over WebDAV on `/dav`, as the folders and files `brain-data/` holds, at the visibility of the person signed in: anything they may not see is not listed and answers 404. A mount signs in with an app password, created in Studio under Account → Drive: a generated username and password shown once, read-only unless saving is allowed when it is created, valid for the drive only, expiring after a year, revocable, and refused over plain HTTP except on localhost. Saving, creating and deleting a markdown file through the drive go through the type's validation, the entity action and visibility policies and a stale-write check, as a Studio edit does; an image file in `image/` is stored as an asset with its image entity, as a file imported from `brain-data/` is; editors' temporary files and new empty folders are held per person in memory and never become entities. The drive offers WebDAV class 2 locks, which macOS Finder and Windows need to mount it writable. Renaming files and saving documents are not offered. The tab shows the drive address and the steps for GNOME Files and rclone. Web routes may now declare `HEAD` and the WebDAV methods, and entity file placement moved from directory-sync into the shared `@brains/entity-placement` package with no change to any path.
- Updated dependencies []:
  - @brains/entity-service@0.2.0-alpha.736
  - @brains/utils@0.2.0-alpha.736
