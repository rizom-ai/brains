# Plan: One sync rule — the brain decides, no edit is lost

Last updated: 2026-11-18

## Status

Proposed; nothing is implemented. It follows #999, which stops saves through the WebDAV drive from deleting entities, and replaces the per-path rules below with one.

## Goal

The brain's entity database is the source of truth for content, and git is its backup and history. Every way an edit reaches the brain names the version it started from. An edit made over a newer version is never written over that version and never thrown away. An edit held nowhere else becomes a `conflict` entity, shown in the Inbox until someone applies or dismisses it: one from Studio, the WebDAV drive, a file in `brain-data/` or a git pull. An edit already held durably is refused: one from chat, whose conversation keeps it and whose agent can read the current version and try again.

## Non-goals

- No merging of entity content inside the brain. Git still merges hunks that do not overlap; nothing else merges.
- No change to `.invalid` quarantine (`plugins/directory-sync/src/lib/quarantine.ts`): it handles files that fail validation, not edits that clash.
- No storing of drive saves byte for byte. The brain rewrites many saves (a plain note's final newline, CRLF, a BOM, flow lists, quotes, YAML comments, `visibility: public`, a hand-written `created:`), which keeps rclone retrying; that is its own change.
- No conflict for an edit that changes nothing.

## Today

Each way in decides on its own who wins:

| Way in                | Clash today                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Studio                | Refused with 409 when `baseContentHash` is stale (`plugins/studio/src/editor-entities.ts:606-619`), but the base is optional and the write itself passes no `expectedContentHash` (`:643-646`), so a change between check and write is overwritten.                                                                                                                                                                                               |
| Chat and MCP          | `system_update` writes with `expectedContentHash` and fails on `content-conflict` (`shell/core/src/system/entity-update-tool.ts:153-163`).                                                                                                                                                                                                                                                                                                        |
| WebDAV drive          | The save wins over whatever is current: rclone never sends `If-Match` (`plugins/webdav/src/dav-saves.ts:132,168`), and it retries a failed upload indefinitely.                                                                                                                                                                                                                                                                                   |
| File in `brain-data/` | The file wins. directory-sync keeps no record of what it exported, so an edited file and a changed entity look like one edit; the stale-import guard only covers the time between queueing and writing (`import-pipeline.ts:85-102`), and a skipped stale import is then overwritten by export (`file-operations.ts:387-397`). An import also clears a pending export without looking (`shell/entity-service/src/entity-mutations.ts:1479-1481`). |
| Git pull              | The remote wins: `-Xtheirs` settles overlapping hunks inside the pull, and conflicts git cannot settle are checked out `--theirs` (`plugins/directory-sync/src/lib/broker/git-pull.ts:45-57,188-204`).                                                                                                                                                                                                                                            |

## Decisions

### Every way in names its base

- **Studio** requires `baseContentHash` and writes with it as `expectedContentHash`, so the check and the write are one. A stale save still answers 409, and records the edit as a conflict first: today the text is held only in the browser (`StudioConflictRecovery`), and a closed tab loses it. The 409 names the conflict, and the editor's recovery panel becomes a view of it with the Inbox's two actions, so resolving it in the editor resolves the Inbox item too.
- **Chat and MCP** keep today's check and refuse a stale edit; a proposal without `contentHash` is refused instead of written blind. No conflict is recorded: the conversation holds the edit.
- **The drive** takes `If-Match` when a client sends one. Otherwise the base is the ETag the drive last served that person for that path when they read the file (GET or HEAD), recorded durably in runtime-state so it outlives a restart: rclone edits its cached copy without reading the file again. A listing does not record a base. A save with no recorded read (a file written without being opened) counts as based on the current version, as today.
- **A file in `brain-data/`**: directory-sync records, per entity, the content hash it last exported or imported, durably beside the export state. A file whose hash differs from that base is an edit. If the entity's hash differs from the base as well, both sides changed: the entity stays and the file's text becomes a conflict, then export rewrites the file.
- **A git pull** fetches and merges without `-Xtheirs`. Hunks that do not overlap merge as now. A file git cannot merge keeps the brain's side (`--ours`, the committed export) and the remote side becomes a conflict.

### An edit that changes nothing is never a conflict

An edit whose text the type reads to the entity that is already stored is a save that changes nothing, whatever its base. rclone's retry of a save the brain stored in another form is one of these. A conflict is not recorded twice: the same target and the same losing text make one.

### The `conflict` entity type

`entities/conflict` (`@brains/conflict`), a `defineEntityPackage` with no CRUD tools, `classification: "system"`, in the `core` bundle beside `prompt` and `directory-sync` (`packages/brain-cli/src/model/canonical-bundles.ts`). The drive and directory-sync check for the type once plugins are registered and refuse to start without it, since without it they could only lose the edit.

- **Id**: `<entityType>:<entity id>:<stamp>`, placed at `brain-data/conflict/<entityType>/<id path>/<stamp>.md` (`shared/entity-placement/src/placement.ts`). The stamp is the UTC time `YYYYMMDDTHHMMSSZ`, with `-2`, `-3` appended when taken; it holds no `:`.
- **Frontmatter**: `entityType`, `entityId`, `origin` (`studio` | `drive` | `file` | `git`), `actor` (the user id, or none for a file or a pull), `base` (the content hash the edit started from), `current` (the content hash it would have replaced), `created`.
- **Body**: the losing file exactly as it arrived.
- **Visibility**: the target's, so a restricted note's losing edit stays restricted.
- **Kept out of the brain's knowledge**: `embeddable: false`, `fullTextSearchable: false`, `includeInBroadSearch: false`, `projectionSource: false` (`shell/entity-service/src/types.ts:751-791`). Nothing publishes a conflict.
- **Fixed once written**: only the brain creates one, and nobody edits one. The drive answers a write to `conflict/` with 403; an edited conflict file in `brain-data/` is not imported and export restores it.

It travels to `brain-data/` and git like any type, so an unresolved conflict is in the backup, and shows as a `conflict/` folder on the drive.

### The Inbox resolves it

The type declares an Inbox source (`EntityInboxDeclaration`, `shell/plugins/src/entity/entity-definition-contract.ts:298-317`), the way FAQ offers its alternatives (`entities/faq/src/lib/faq-inbox.ts:62-68,133-158`). An item names the target, where the edit came from, who made it and when; its detail is the losing text.

- **Apply this version** writes the conflict's body to the target over the version it holds now, through `ctx.edits` with the target's current content hash, then deletes the conflict. When the target changed meanwhile, the item stays and shows the new current version.
- **Keep current** deletes the conflict; git history still holds it.

A person sees and resolves the conflicts of entities they may update.

## Phases

One PR per phase, tests first in each, and a changeset.

### Phase 1 — the `conflict` type and its Inbox

1. Tests: placement and id round trip, including nested target ids; the type's flags keep it out of search and projections; visibility follows the target; the drive refuses writes under `conflict/`; the two Inbox actions, including a target that changed meanwhile; one conflict for a repeated losing text.
2. Implement `entities/conflict`, add it to `core`, and add the start check to the drive and directory-sync.

### Phase 2 — files in `brain-data/`

1. Tests: an edited file over an unchanged entity imports; an edited file over a changed entity becomes a conflict and the file is rewritten; the brain's own echo stays an echo; a stale import that is skipped today becomes a conflict; an import no longer clears another write's pending export.
2. Implement the durable per-entity base hash and the conflict path in the import pipeline.

### Phase 3 — git pulls

1. Tests: a remote edit to a file the brain has not changed imports; non-overlapping edits on both sides merge; overlapping edits keep the brain's side and record the remote's as a conflict; a remote delete of a file the brain changed becomes a conflict, not a delete.
2. Implement fetch plus merge without `-Xtheirs`, and per-file conflict recording before the merge commit.

### Phase 4 — the drive

1. Tests: a PUT with `If-Match` over a newer version becomes a conflict and answers 204; a PUT without it, based on the ETag last served to that person, does the same, also after a restart; a save that changes nothing is a no-op, also when rclone retries it; a save with no recorded read saves over the current version.
2. Implement the durable per-person read base and the conflict path in `saveEntityFile`.

### Phase 5 — Studio and chat

1. Tests: Studio refuses a save without `baseContentHash`; a stale save answers 409 naming a conflict that holds the edit, including a change made between check and write; resolving it from the editor's recovery panel removes the Inbox item; `system_update` refuses a stale edit and a proposal without `contentHash`, and records no conflict.
2. Implement the conflict path in Studio's save route and the recovery panel over the conflict.

## Validation

- The affected workspaces' typecheck, lint and tests, plus brain-cli `bun run test`.
- On the `personal` test app: edit a note in Studio while an rclone mount saves an older copy, edit the same line in the content repo and in Studio before a pull, and restart during an export; each ends with the brain's version live and the other in the Inbox as a conflict, and nothing lost.
