# Directory Sync Git Overview

This document explains how `@brains/directory-sync` behaves in traditional git command terms.

## Mental model

```text
Brain DB  <->  brain-data/ files  <->  git remote
            import/export             pull/commit/push
```

- **Export** means Brain entity → markdown/image file.
- **Import** means markdown/image file → Brain entity.
- **Git sync** means normal git operations around the sync directory, usually `brain-data/`.

The sync directory is the git working tree. The Brain database is another view of that same content.

## Startup and repository setup

On startup, directory-sync ensures the sync directory exists:

```bash
mkdir -p brain-data
```

With a git remote configured and no checkout yet, directory-sync first asks the remote for its branches:

```bash
git ls-remote --heads <remote>
```

If the remote has history, the checkout is built in place rather than cloned, because a deployed data directory is a mount point that can be written into but not replaced:

```bash
cd brain-data
git init --initial-branch=main
git remote add origin <remote>
git fetch --no-tags origin main
git checkout -f -B main --track origin/main
git clean -fd
```

The remote's content replaces whatever the directory held before. If the fetch fails, startup fails with it; the next start builds the checkout again, since an unfinished checkout is marked as such. Only when `ls-remote` fails or the remote has no branches does directory-sync initialize locally instead:

```bash
cd brain-data
git init --initial-branch=main
git remote add origin <remote>
```

Either way, the checkout is then configured:

```bash
git config user.name "Brain"            # git.authorName
git config user.email "brain@localhost" # git.authorEmail
git config pull.rebase false
```

The remote URL is stored without credentials; the token is supplied to each git command and never written to `.git/config`. Git hooks and automatic maintenance never run in the checkout.

If seed content is enabled and the sync directory is effectively empty, seed files are copied into the directory before import.

## Initial sync

Initial sync pulls remote content before importing files into the Brain database:

```bash
cd brain-data
git fetch origin main
git merge --no-edit refs/remotes/origin/main
```

Then directory-sync imports the resulting files:

```text
brain-data/ files -> Brain DB entities
```

If the remote branch does not exist yet, directory-sync bootstraps it:

```bash
git add -A
git commit -m "Bootstrap remote branch"
git push -u origin main
```

## Entity changes

When an entity is created or updated in the Brain app, directory-sync exports it to a file:

```text
Brain DB entity -> brain-data/<entity-type>/<id>.md
```

In git terms, the follow-up auto-commit is equivalent to:

```bash
git add -A
git commit -m "Auto-sync: <timestamp>"
git push -u origin main
```

When an entity is deleted, directory-sync deletes the matching file and the same auto-commit flow applies:

```bash
rm brain-data/<entity-type>/<id>.md
git add -A
git commit -m "Auto-sync: <timestamp>"
git push origin main
```

Auto-commit is debounced, so a burst of entity changes can be batched into one trailing commit.

## File changes

While `autoSync` is on (the default), directory-sync watches the sync directory live. It polls every `watchInterval` (1000 ms by default) and waits for a file to stop changing for two seconds before reading it, so a save in an editor is imported once, complete.

When a watched file changes on disk, directory-sync imports that file into the Brain database:

```text
brain-data/<path>.md -> Brain DB entity
```

That database update emits entity events, which can then export/write the final entity state back to disk. Git auto-commit then records the result:

```bash
git add -A
git commit -m "Auto-sync: <timestamp>"
git push origin main
```

If the entity also changed in the brain since the file and the entity last agreed, for example through a Studio save, the file's edit is not imported over it. It is kept as a conflict in the Inbox, and the file is rewritten with the brain's version.

When a watched file is removed and `deleteOnFileRemoval` is enabled (the default), directory-sync deletes the matching Brain entity. That deletion is then committed and pushed. An entity that changed in the brain since the file last matched it is not deleted; its file is written back instead.

## Manual sync tool

The `directory_sync` tool (`brain sync` on the command line, Admin only) takes an `action`:

- `sync` (the default) queues a git pull and a scan of the sync directory;
- `status` reports the sync path, the last sync, whether the directory is watched, and the git state;
- `history`, with git configured, reads the git history of one entity, by `entityType` and `id`, optionally at a revision `sha`.

With git configured, a sync normally imports only the files changed since the last sync; `full: true` rescans every file, for files an earlier sync skipped:

```bash
brain tool directory_sync '{"action":"sync","full":true}'
```

Running `sync` with git configured is roughly:

```bash
cd brain-data

# Preserve dirty local work first, if needed.
git add -A
git commit -m "Pre-pull commit: preserving local changes"

# Pull remote content.
git fetch origin main
git merge --no-edit refs/remotes/origin/main

# Import resulting files into the Brain DB.
```

Any entity changes caused by the import are later handled by the normal export and auto-commit path.

## Periodic sync

When `autoSync` and git sync are enabled, directory-sync periodically pulls remote changes:

```bash
git fetch origin main
git merge --no-edit refs/remotes/origin/main
```

If files changed, it queues imports through the job system. Resulting entity changes are committed and pushed by auto-commit. `syncInterval` sets the period in minutes (default 2).

## Full rescans and newly enabled entity types

With git configured, a sync imports only what changed since its checkpoint, and the checkpoint records which entity types the last scan covered. When that set changes, for example after you enable a plugin that adds an entity type, the next sync rescans every file instead of only what changed since the checkpoint. Files under `brain-data/<new-type>/` that earlier syncs skipped are imported by that sync, usually the startup sync after the change, with no manual rescan.

The same full rescan follows a failed startup sync or import, and an import job that a worker refused because it does not know one of the job's entity types (during a rolling deploy, the previous container's worker may share the job queue). Such a job fails and retries on the current worker rather than completing with files skipped.

## Conflict resolution

Directory-sync does not do a semantic, entity-aware merge. It keeps track of the version each file and its entity last agreed on, and an edit made over an older version never silently replaces a newer one. The losing edit is kept as a conflict in the Inbox, where the person who made it or an Admin can apply it over the current version or dismiss it.

Edits arrive by four ways, and each can lose this way:

- **Studio**: a save over an entry that changed since it was opened is refused, and the edit is kept as a conflict;
- **the drive (WebDAV)**: a save from an older copy is answered as saved, and kept as a conflict instead of replacing the current version;
- **a file in `brain-data/`**: see [File changes](#file-changes);
- **a git pull**: see below.

An image that changed in both places is not kept as a conflict: the brain's newer image stays. See [Content Management](./content-management.md#edit-conflicts) and [Drive and Obsidian](./drive-and-obsidian.md) for the owner's view.

### Pull conflicts: the brain's version stays

Before pulling, dirty local work is preserved in a local commit:

```bash
git add -A
git commit -m "Pre-pull commit: preserving local changes"
```

Then the pull fetches and merges:

```bash
git fetch origin main
git merge --no-edit refs/remotes/origin/main
```

This means:

- changes to different files, or to different parts of one file, merge normally;
- when both the brain and the remote changed the same lines of a Markdown file, the brain's version stays and the remote's version is kept as a conflict in the Inbox, where it can be applied over the current version or dismissed;
- a file the remote deleted while the brain changed it stays, and its entity is not deleted;
- a file the brain deleted while the remote changed it comes back;
- a binary file both sides changed takes the remote's version.

The remote's text of a conflicted file is held beside the checkout's git state until the conflict is recorded, so a restart between the merge and the recording does not lose it. The merge is committed as:

```bash
git commit -m "Auto-resolve merge conflict (the brain's version kept)"
```

A checkout whose history shares no commit with the remote, such as a seeded directory meeting its remote for the first time, has no version both sides started from. There the remote wins:

```bash
git merge --no-edit --allow-unrelated-histories --strategy=recursive -Xtheirs refs/remotes/origin/main
```

After the merge, the final file state is imported into the Brain DB.

### Auto-commit conflicts: local wins

If the working tree is already conflicted during a local auto-commit, directory-sync resolves using the local side:

```bash
git checkout --ours <conflicted-file>
git add -A
git commit -m "Auto-sync: <timestamp>"
```

Before committing, it checks staged text files for conflict markers:

`<<<<<<<`, `=======`, or `>>>>>>>`

If conflict markers are found, the commit fails and manual intervention is required.

## Short version

For normal operation, directory-sync behaves like a git bot around `brain-data/`:

```bash
git pull
# import/export Brain entities and files
git add -A
git commit -m "Auto-sync: <timestamp>"
git push
```

Its default conflict policy is:

- **the brain's version stays during pull**, and the remote's text of the same lines is kept as a conflict in the Inbox;
- **local wins during auto-commit cleanup**;
- **manual intervention is required if conflict markers would be committed**.
