# @brains/vault-sync

The sync engine that keeps a folder of files in step with a brain through its drive (`plugins/webdav`). The Rizom Brain plugin for Obsidian runs it; `brain sync` and the Neovim plugin are planned on it (`docs/plans/neovim-plugin.md`).

The brain's structure leads: notes are the files at the top of the folder, every other entry sits in the folder of its type, and anything else stays local. A version is told by the brain's ETag and a hash of the file, never by size or time. An edit made in both places is never lost: the brain's version goes into the folder and the other is kept as a conflict.

## Using it

- `SyncEngine` takes a vault (`SyncVault`: files by path), a `DriveClient` and a `StateStore`. `HttpFetch` is how the drive client sends a request, so each editor brings its own.
- `ChangeWatcher` and `ChangeFollower` follow the drive's change feed (`.brain/changes`) and sync the types that changed.
- `generated` is optional: files an editor wants for the brain's types, in a folder of its own that is never synced. Obsidian passes its templates, fileClasses and bases.

## Tests

`test/` runs the engine against a real brain in process: the note, image, document and conflict packages and the drive, over an entity store on disk. `@brains/vault-sync/test` exports that brain and a vault for other packages' tests.
