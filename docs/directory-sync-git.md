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

If a git remote is configured and has history, startup is equivalent to:

```bash
git clone <remote> brain-data
```

If the remote is empty or cloning fails, it initializes locally instead:

```bash
cd brain-data
git init -b main
git remote add origin <remote>
git config user.name "Brain"
git config user.email "brain@localhost"
git config pull.rebase false
```

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

When a watched file is removed and `deleteOnFileRemoval` is enabled, directory-sync deletes the matching Brain entity. That deletion is then committed and pushed.

## Manual sync tool

Running the `sync` tool with git configured is roughly:

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

If files changed, it queues imports through the job system. Resulting entity changes are committed and pushed by auto-commit.

## Conflict resolution

Conflict handling is git-level. Directory-sync does not do a semantic, entity-aware merge.

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
