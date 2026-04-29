# @brains/directory-sync

File-backed content synchronization for brain instances.

`directory-sync` maps files in a sync directory, usually `brain-data/`, to typed markdown entities and can optionally keep that directory synchronized with git.

## What it does

- imports markdown files into the entity database
- exports entity changes back to files
- watches files and entity events for bidirectional auto-sync
- supports images under `image/`
- copies seed content on first run
- optionally pulls, commits, and pushes a git-backed content repo
- can bootstrap a missing/empty local `file://` bare remote from seed content

## Path conventions

```text
brain-data/
  README.md                    # entityType: base, id: README
  post/my-first-post.md         # entityType: post, id: my-first-post
  site-content/home/hero.md     # entityType: site-content, id: home:hero
  image/cover.png               # entityType: image
```

Root markdown files become `base` note entities. Files under `brain-data/<entity-type>/` use the first path segment as the entity type. Nested paths below that directory become colon-separated ids.

## Typical brain.yaml config

```yaml
plugins:
  directory-sync:
    seedContent: true
    seedContentPath: ./seed-content
    initialSync: true
    autoSync: true
    git:
      repo: your-org/brain-data
      authToken: ${GIT_SYNC_TOKEN}
```

For a full git URL instead of `repo`:

```yaml
plugins:
  directory-sync:
    git:
      gitUrl: file:///tmp/mybrain-content.git
      branch: main
```

## Config reference

| Field                   | Default           | Notes                                                             |
| ----------------------- | ----------------- | ----------------------------------------------------------------- |
| `syncPath`              | shell data dir    | Directory to sync, usually `brain-data/`                          |
| `autoSync`              | `true`            | Watch files and export entity changes                             |
| `watchInterval`         | `1000`            | File watcher polling interval in ms                               |
| `includeMetadata`       | `true`            | Include frontmatter metadata                                      |
| `entityTypes`           | unset             | Optional list of entity types to sync                             |
| `initialSync`           | `true`            | Run startup import during shell coordination                      |
| `syncBatchSize`         | `10`              | Batch size for sync jobs                                          |
| `syncPriority`          | `3`               | Job priority, 1–10                                                |
| `seedContent`           | `true`            | Copy seed content when the target directory is effectively empty  |
| `seedContentPath`       | cwd seed path     | Seed content directory                                            |
| `deleteOnFileRemoval`   | `true`            | Delete entities when synced files are removed                     |
| `syncInterval`          | `2`               | Periodic git pull/import interval in minutes                      |
| `commitDebounce`        | `5000`            | Debounce before auto-commit after entity changes                  |
| `git.repo`              | unset             | GitHub-style `owner/name` repo                                    |
| `git.gitUrl`            | unset             | Full remote URL; overrides `repo`                                 |
| `git.branch`            | `main`            | Branch to sync                                                    |
| `git.authToken`         | unset             | Token for private remotes                                         |
| `git.authorName`        | `Brain`           | Commit author name                                                |
| `git.authorEmail`       | `brain@localhost` | Commit author email                                               |
| `git.bootstrapFromSeed` | `true`            | Seed missing/empty local `file://` remotes from `seedContentPath` |

## Tools

The plugin registers CLI/MCP tools through the shell:

```bash
brain tool sync
brain tool status
brain tool directory-sync_history '{"path":"post/my-first-post.md"}'
```

`sync` pulls from git when configured, imports changed files, and lets auto-export/auto-commit handle entity changes. `status` reports sync and git state. `directory-sync_history` reads git history for synced files.

## Seed and local remote bootstrap

On startup, shipped brain models usually configure `seedContentPath` to their package seed content. Seed files are copied only when the target data directory is effectively empty.

When `git.gitUrl` is a local `file://` remote, `git.bootstrapFromSeed` defaults to `true`. If the bare remote is missing or does not yet have the configured branch, directory-sync creates/seeds it from `seedContentPath`. Existing remote branches are left untouched.

Set `bootstrapFromSeed: false` to opt out.
