# Plan: One sync rule — the brain decides, no edit is lost

Last updated: 2026-11-18

## Status

Proposed; nothing is implemented. It follows #999 (merged 2026-11-18), which stops saves through the WebDAV drive from deleting entities, and replaces the per-path rules below with one.

## Goal

The brain's entity database is the source of truth for content, and git is its backup and history. Every way an edit reaches the brain names the version it started from. An edit made over a newer version is never written over that version and never thrown away:

- An edit held nowhere else becomes a `conflict` entity, shown in the Inbox until someone applies or dismisses it: one from Studio, from a drive client that names no version, from a file in `brain-data/` or from a git pull.
- An edit its sender still holds is refused: one from chat, whose conversation keeps it, one from a drive client that named the version it edited, and one from a background job, which reads the current version and does its work again.
- A delete made over a newer version does not happen.

## Non-goals

- No merging of entity content inside the brain. Git still merges hunks that do not overlap; nothing else merges.
- No change to `.invalid` quarantine (`plugins/directory-sync/src/lib/quarantine.ts`): it handles files that fail validation, not edits that clash.
- No storing of drive saves byte for byte. The brain rewrites many saves (a plain note's final newline, CRLF, a BOM, flow lists, quotes, YAML comments, `visibility: public`, a hand-written `created:`), and rclone reads a file's size back after an upload and uploads again when it differs. A save filed as a conflict leaves the other version on the drive, so rclone keeps retrying it; this plan makes each retry a no-op and leaves the retrying itself to that change.
- No conflict for an edit that changes nothing.

## Today

Each way in decides on its own who wins:

| Way in                | Clash today                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Studio                | Refused with 409 when `baseContentHash` is stale (`plugins/studio/src/editor-entities.ts:606-619`), but the base is optional and the write itself passes no `expectedContentHash` (`:643-646`), so a change between check and write is overwritten.                                                                                                                                                                                               |
| Chat and MCP          | `system_update` writes with `expectedContentHash` and fails on `content-conflict` (`shell/core/src/system/entity-update-tool.ts:153-163`).                                                                                                                                                                                                                                                                                                        |
| WebDAV drive          | A save with `If-Match` is refused with 412 when stale. A save without one wins over whatever is current: rclone never sends `If-Match` (`plugins/webdav/src/dav-saves.ts:132,168`), and it retries a failed upload indefinitely.                                                                                                                                                                                                                  |
| File in `brain-data/` | The file wins. directory-sync keeps no record of what it exported, so an edited file and a changed entity look like one edit; the stale-import guard only covers the time between queueing and writing (`import-pipeline.ts:85-102`), and a skipped stale import is then overwritten by export (`file-operations.ts:387-397`). An import also clears a pending export without looking (`shell/entity-service/src/entity-mutations.ts:1479-1481`). |
| Git pull              | The remote wins: `-Xtheirs` settles overlapping hunks inside the pull, and conflicts git cannot settle are checked out `--theirs` (`plugins/directory-sync/src/lib/broker/git-pull.ts:45-57,188-204`).                                                                                                                                                                                                                                            |
| Background jobs       | The job wins. Email workflows, topics, agent discovery, the content pipeline and stock photos read an entity, work, and write it back with no `expectedContentHash`; content generation already passes one (`shell/content-service/src/handlers/contentGenerationJobHandler.ts`).                                                                                                                                                                 |

## Decisions

### Every way in names its base

- **Studio** requires `baseContentHash` and writes with it as `expectedContentHash`, so the check and the write are one. A stale save still answers 409, and records the edit as a conflict first: today the text is held only in the browser (`StudioConflictRecovery`), and a closed tab loses it. The 409 names the conflict, and the editor's recovery panel becomes a view of it with the Inbox's two actions, so resolving it in the editor resolves the Inbox item too.
- **Chat and MCP** keep today's check and refuse a stale edit; a proposal without `contentHash` is refused instead of written blind. No conflict is recorded: the conversation holds the edit.
- **The drive, with `If-Match`**: a client that names the version it edited still holds the edit and tells its user when a save is refused. A stale save answers 412, as today, and records no conflict.
- **The drive, without `If-Match`**: the base is the version this mount last held for that path. A mount is an app password; two computers of one person have two. The base is set when the mount reads the file (GET or HEAD) and when its own save succeeds, to the version the brain stored; a listing does not set it. It is recorded in runtime-state, so it outlives a restart, and dropped with the app password or after 30 days without use. A save over a newer version than the base is stored as a conflict and answers 204: rclone has nowhere to show a refusal and would retry it. A save with no recorded base (a file written without being opened) counts as based on the current version, as today.
- **A file in `brain-data/`**: directory-sync records, per entity, the hash it last exported or imported, in runtime-state. The hash is of the file as its type reads and writes it back, the form the import already computes (`plugins/directory-sync/src/lib/import-persistence.ts:177-181`), so a file that differs only in bytes (CRLF from a checkout, a missing final newline) is no edit. A file whose hash differs from that base is an edit. If the entity's hash differs from the base as well, both sides changed: the entity stays and the file's text becomes a conflict, then export rewrites the file. The comparison runs where the import writes, in place of the revision captured when the import was queued (`import-pipeline.ts:85-102`), which today skips a stale import before its file is read; an entity that changes between that comparison and the write is compared again. An entity with no recorded base (every entity on the first run) is handled as today, and its base is recorded then. Runtime-state is its own database, so a base is written after the import or export it records, not with it; a crash between the two leaves an older base, and the file and the entity then compare equal, which is no edit.
- **A git pull** fetches and merges without `-Xtheirs`. Hunks that do not overlap merge as now. A file git cannot merge keeps the brain's side (`--ours`, the pre-pull commit) and the remote side becomes a conflict.
- **A background job** writes with the hash of the version it read as `expectedContentHash`. When that version is stale, the job reads the current one and does its work again, or drops its result when the work no longer applies. It never records a conflict.

### A delete over a newer version does not happen

A delete names its base as an edit does: the drive's `If-Match` or the mount's base, the hash directory-sync recorded for a removed file, the pre-pull commit for a file the remote deleted. directory-sync deletes an entity for a missing file in three places, and each checks the base: the watcher's delete job (`handlers/directoryDeleteJobHandler.ts:147-151`), the orphan cleanup after an import (`cleanup-pipeline.ts:55-85`) and a batch export that finds no file (`export-pipeline.ts:93-104`). When the entity is newer than that base, it stays, export writes its file back, and nothing is put in the Inbox: a delete carries no text to keep, and the person can delete the current version. The drive answers such a delete 412 when it named a version and 409 otherwise, which rclone does not retry (#999).

### An edit that changes nothing is never a conflict

An edit whose text the type reads to the entity that is already stored is a save that changes nothing, whatever its base. rclone's retry of a save the brain stored in another form is one of these.

A conflict is not recorded twice: the same target and the same losing text make one, found by the conflict's `edit` hash. A conflict that was resolved does not come back either: the drive remembers, per mount and path, the `edit` hash of a conflict that was applied or dismissed, and answers the same save again with 204 and no new conflict, until that mount reads the file again or its app password ends. Files and pulls are not sent twice and need no such memory.

### The `conflict` entity type

`entities/conflict` (`@brains/conflict`) pairs the type with a first-party service, as `entities/book` and `entities/faq` do. It is in the `core` bundle beside `prompt` and `directory-sync` (`packages/brain-cli/src/model/canonical-bundles.ts`), with `classification: "system"`. The drive and directory-sync may not import an entity package (`.dependency-cruiser.js:121-141`), so they hand a losing edit over through a bus contract in `@brains/contracts`, which the conflict service answers in every process: import jobs run on the worker. Both check for the type once plugins are registered (`runtime.registered`) and throw there, which stops the boot: without it they could only lose the edit.

- **Id**: `<entityType>:<entity id>:<stamp>`, placed at `brain-data/conflict/<entityType>/<id path>/<stamp>.md` (`shared/entity-placement/src/placement.ts`). The stamp is the UTC time `YYYYMMDDTHHMMSSZ`; the conflict is created only if absent, and a taken stamp is tried again with `-2`, `-3`. It holds no `:`.
- **Frontmatter**: `entityType`, `entityId`, `origin` (`studio` | `drive` | `file` | `git`), `actor` (the user id of a Studio or drive edit, or none for a file or a pull), `base` (the content hash the edit started from), `current` (the content hash it would have replaced), `edit` (the content hash of the losing text), `created`.
- **Body**: the losing file exactly as it arrived.
- **Visibility**: the stricter of the target's and the one the losing text declares, and never public: a conflict on a public note is shared. A losing edit can be an unpublished draft, and `classification: "system"` hides a type from grouping and Studio's navigation, not from a public read.
- **Kept out of the brain's knowledge**: `embeddable: false`, `fullTextSearchable: false`, `includeInBroadSearch: false`, `projectionSource: false` (`shell/entity-service/src/types.ts:751-795`). Nothing publishes a conflict.
- **Fixed once written**: its action policy is `never` for create, update and delete (`shell/entity-service/src/types.ts:787-792`), so Studio, chat and MCP cannot write one; only the package's service creates and removes them, through writes that carry no action policy (`shell/plugins/src/service/service-runtime.ts:339-344`). The drive answers a write or a delete under `conflict/` with 403. An edited or removed conflict file in `brain-data/`, or one a pull changes or deletes, is not imported, and export restores it: directory-sync has no type it only exports today (`import-path-filter.ts:15-41`), and gains this one rule.

It travels to `brain-data/` and git like any type, so an unresolved conflict is in the backup, and shows as a `conflict/` folder on the drive.

### The Inbox resolves it

The package's service offers the Inbox source through `runtime.inboxSource`, as email workflows and the action board do, registered in the service's setup. It does not use the type's own `inbox` declaration: that contract is part of the stable 0.2 authoring surface, and its edits reach only records of the declaring type (`shell/plugins/src/entity/entity-definition-contract.ts:245-256`).

The Inbox is the admin's. The registry refuses detail and actions to anyone below admin for every source (`shell/plugins/src/inbox-registry.ts:404-412`), and the Inbox workspace and tool are admin-only (`plugins/unified-inbox/src/operator-studio.ts:56,249`). A trusted person whose save lost sees the conflict as a file under `conflict/` on the drive and in Studio's system area, and an admin resolves it.

- **The listing** is gathered with no viewer behind it (`inbox-registry.ts:284-292`), so an item carries no text: it names the target's type and id, where the edit came from and when.
- **The detail** is the one plain text the Inbox shows (`inbox-registry.ts:234-238`): a line diff from the current version to the losing text, changed lines first in the order they appear. Studio's reading pane shows its first 4,000 characters; the conflict's file holds the losing text whole.
- **Apply this version** writes the conflict's body to the target over the version it holds now, with the target's current content hash as `expectedContentHash`, held to the update action (publish, when it moves the target into a published status) and the visibility policy at the actor's level, then removes the conflict. When the target changed meanwhile, the item stays and shows the new current version. The Inbox passes an actor's permission level and no user id (`inbox-registry.ts:225-227`), so the write is attributed to the Inbox, not to a person.
- **Keep current** removes the conflict; git history still holds it.

### A losing image

An image save over a newer version follows the same rule as text. The losing bytes are staged as an asset, and the conflict's body is its reference, with the image's format and size in its metadata. The Inbox detail shows both images. Apply writes the reference to the target, as an image save does; Keep current removes the conflict and, with it, the last reference to the asset.

## Phases

One PR, a commit per phase, tests first in each, and a changeset.

### Phase 1 — a file in `brain-data/` that loses lands in the Inbox

1. Tests: the `conflict` type's placement and id round trip, including nested target ids; its flags keep it out of search and projections; its visibility is the stricter of the target's and the losing text's, and never public; Studio, chat and MCP cannot create, update or delete one; an edited or removed conflict file is not imported and export restores it. An edited file over an unchanged entity imports; an edited file over a changed entity becomes a conflict and the file is rewritten; a file that differs from its base only in bytes is no edit; an entity with no recorded base imports as today and records one; the brain's own echo stays an echo; a stale import that is skipped today becomes a conflict; an import no longer clears another write's pending export; a file removed over a changed entity deletes nothing and is written back, from the watcher, from the orphan cleanup and from a batch export. The two Inbox actions, including a target that changed meanwhile and a target whose type refuses updates; the detail is a diff from the current version to the losing text; one conflict for a repeated losing text; a taken stamp gets a suffix. directory-sync refuses to start without the type.
2. Implement the bus contract, `entities/conflict` with its service and Inbox source, add it to `core`, add the start check to directory-sync, and implement the per-entity base in runtime-state and the conflict path in the import pipeline and the three delete paths.

### Phase 2 — git pulls

1. Tests: a remote edit to a file the brain has not changed imports; non-overlapping edits on both sides merge; overlapping edits keep the brain's side and record the remote's as a conflict; a remote delete of a file the brain changed deletes nothing; a conflict file the remote changed or deleted is restored.
2. Implement fetch plus merge without `-Xtheirs`, and per-file conflict recording before the merge commit.

### Phase 3 — the drive

1. Tests: a PUT with a stale `If-Match` answers 412 and records nothing; a PUT without one, over a newer version than the mount's base, becomes a conflict and answers 204, also after a restart; a mount's own save sets its base, so its next save is no conflict; two mounts of one person keep separate bases; a save that changes nothing is a no-op, also when rclone retries it; the same losing save again makes no second conflict, before and after the first is resolved; a save with no recorded base saves over the current version; a DELETE over a newer version deletes nothing and answers 412 or 409; a write or a delete under `conflict/` answers 403.
2. Implement the per-mount base and the resolved-edit memory in runtime-state, the conflict path in `saveEntityFile`, the base check in `deleteEntityFile`, and the start check.

### Phase 4 — Studio and chat

1. Tests: Studio refuses a save without `baseContentHash`; a stale save answers 409 naming a conflict that holds the edit, including a change made between check and write; resolving it from the editor's recovery panel removes the Inbox item; `system_update` refuses a stale edit and a proposal without `contentHash`, and records no conflict.
2. Implement the conflict path in Studio's save route and the recovery panel over the conflict.

### Phase 5 — images

1. Tests: an image file in `brain-data/` and an image save from a mount, each over a newer image, become a conflict whose body is the staged asset's reference; the detail names both images; Apply writes the reference to the target; Keep current removes the conflict and leaves no unreferenced asset.
2. Implement the image path in the import pipeline and in the drive's image save.

### Phase 6 — background jobs

1. Tests: for each writer that reads an entity and writes it back (email workflows, topics, agent discovery, the content pipeline, stock photos), a change made between its read and its write is not overwritten; the job does its work again on the current version or drops its result, and records no conflict.
2. Pass `expectedContentHash` at each writer and handle `content-conflict`.

## Validation

- The affected workspaces' typecheck, lint and tests, plus brain-cli `bun run test`.
- On the `personal` test app: edit a note in Studio while an rclone mount saves an older copy, edit the same line in the content repo and in Studio before a pull, and restart during an export; each ends with the brain's version live and the other in the Inbox as a conflict, and nothing lost. Dismiss the mount's conflict and leave rclone retrying: no conflict comes back.
