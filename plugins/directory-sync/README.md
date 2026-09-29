# @brains/directory-sync

File-backed content synchronization for brain instances.

`directory-sync` maps files in a sync directory, usually `brain-data/`, to typed markdown entities and can optionally keep that directory synchronized with git.

For a git-command-oriented explanation of the sync lifecycle and conflict policy, see [Directory Sync Git Overview](../../docs/directory-sync-git.md).

## What it does

- imports markdown files into the entity database
- exports entity changes back to files
- watches files and entity events for bidirectional auto-sync
- supports images under `image/`
- copies seed content on first run
- optionally pulls, commits, and pushes a git-backed content repo
- registers an optional Studio Sync workspace for operational status and manual sync
- can bootstrap a missing/empty local `file://` bare remote from seed content

## Path conventions

```text
brain-data/
  README.md                    # entityType: note, id: README
  post/my-first-post.md         # entityType: post, id: my-first-post
  site-content/home/hero.md     # entityType: site-content, id: home:hero
  image/cover.png               # entityType: image
```

Root markdown files become `note` entities. Exportable notes have exactly one ID segment and write `<id>.md` at the root; directories represent entity types. Directory-sync delegates stored-ID encoding and decoding to `@brains/entity-service` and owns filesystem placement. Every type-prefixed segment is retained: site-content ID `site-content:home:hero` exports to `site-content/site-content/home/hero.md`, separately from `home:hero` at `site-content/home/hero.md`.

The read-only `sync:path:request` message previews placement from an entity type, stored ID, metadata and serialized content. It returns a relative path, filename-leaf display offsets, the read-back identity (`owner`), and a pure `writable` verdict. The latter two fields are optional for older responders. Previewing neither writes files nor creates folders; it does not look up existing entities or reserve destinations.

Before writes or deletion, a pure guard checks strict ID segments, flat-only notes, and identity round-trip. Historical invalid IDs raise `EntityPlacementError`; manual export reports failure and orphan cleanup keeps their database rows. Durable refusals are recorded as standing `placement` issues before acknowledgement. These issues clear when the entity exports or its delete intent is processed, not on unrelated successful exports.

Virtual-collection membership does not affect placement. A grouping field such
as `clients` is ordinary frontmatter: adding or removing a value never renames
an entity, moves a file, creates a directory, or changes export admission, and
an entity in several collections still has one stored identity and one export
destination. Export preserves unclaimed frontmatter keys, so membership
survives an export and reimport even when no grouping is currently declared.

No IDs are rewritten and no files are moved or migrated. Old-layout files require operator review; discovery and import interpretation are unchanged. The [golden inventory](test/entity-placement-golden.test.ts) records the seven changed path expectations. Its IDs are synthetic regression inputs, not an inventory of production notes.

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
brain tool directory_sync '{"action":"status"}'
brain tool directory_sync '{"action":"history","entityType":"post","id":"my-first-post"}'
```

`directory_sync` action `sync` pulls from git when configured, imports changed files, and lets auto-export/auto-commit handle entity changes. Action `status` reports sync and git state. Action `history` reads git history for synced files when git is configured.

Queued import and cleanup jobs preserve their durable projection-batch identity through the active-service facade; nested work still must match that identity. A live persist policy (such as a closed grouping vocabulary) can refuse otherwise valid Markdown. That import is reported as failed without moving the file into quarantine, so an explicit retry can succeed after the policy changes. Structural validation failures retain the existing quarantine behavior.

## Optional Studio workspace

When `@brains/studio` is installed, directory-sync registers an **Operations → Sync**
workspace at `/studio/workspaces/sync`. It shows directory, watcher, Git, automation, recent-run,
and quarantined-file status from a bounded runtime projection.

**Sync now** follows the same request path as `directory_sync` action `sync`. The workspace
is intentionally not a file browser or configuration editor. It exposes relative content
paths and a sanitized remote label; credentials and internal stack traces are never sent
to the browser.

Dashboard's existing read-only Content sync card links to the workspace when Studio returns a
management URL. Without Studio, tools, messages, watcher, periodic sync, and Git automation
continue unchanged.

## Seed and local remote bootstrap

On startup, scaffolded instances configure `seedContentPath` to recipe-owned seed content. Seed files are copied only when the target data directory is effectively empty.

When `git.gitUrl` is a local `file://` remote, `git.bootstrapFromSeed` defaults to `true`. If the bare remote is missing or does not yet have the configured branch, directory-sync creates/seeds it from `seedContentPath`. Existing remote branches are left untouched.

Set `bootstrapFromSeed: false` to opt out.
