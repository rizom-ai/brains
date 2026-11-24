# Plan: An Obsidian plugin that syncs a vault with a brain

## Status

Phases 1 to 9 are built on #1028, with the first half of phase 10: CI builds the plugin and keeps its three files as a run artifact. Still to do: the public repository and the community directory submission, which publish the plugin, and a check on iOS and Android.

Where the build differs from the plan:

- For a sync client the drive lists every entity type's folder, empty or not, and takes a save into an empty one. Without that, a brain with no images yet had no `image/` folder to save into.
- Renaming a note moves its pending conflicts and rewrites FAQ sources that cite it. Documents and images generated from an entry are made only from posts and decks, so a note rename never reaches them.
- A file edited a moment ago is still uploaded by a sync; only writing into it waits until the person stops typing.
- The plugin is named Rizom Brain (id `rizom-brain`).
- Publishing is prepared: the public repository's root files (`packages/obsidian-plugin/public/README.md`, `manifest.json`, `versions.json`, the license) and a hand-started workflow that updates that repository and creates the tagged release. Obsidian now takes submissions at community.obsidian.md, by signing in and linking the GitHub account that owns the repository, not by pull request.
- The plugin took over the brain-side `obsidian-vault` capability, which is retired. The drive describes the brain's types to sync clients (`.brain/vault-shapes.json`), and the plugin writes `_obsidian/` from that: templates and fileClasses as the brain writes them, bases only where missing.
- Each brain keeps its own sync state in the plugin, so changing the address loses nothing.
- Changes in the brain reach the vault as they happen. The plugin asks the drive what changed since its cursor (`.brain/changes`), the brain holds the ask until something does, and the plugin lists only the folders of the types that changed. The timed full sync, now every 30 minutes, is the safety net.

## Background

A brain can be mounted as a network drive (`plugins/webdav`) and the mount can be opened as an Obsidian vault. Two things make that a poor way to use Obsidian:

- **Speed.** Measured on a brain with 300 notes, the drive answers a file request in about 2 ms and lists the folder in 39 ms. From Taipei to a server in Europe each request takes about 270 ms on the network, and a desktop's WebDAV client sends several per file, one after another. Obsidian reads every file when it opens a vault. The wait is the distance times the number of requests; nothing in the drive changes it.
- **Fit.** A mounted folder is the drive's rules applied to every file operation: only an entity type can be a folder, a PDF is refused, and a refused operation surfaces as a file-system error.

A local cache in front of the drive (rclone with `--vfs-cache-mode full`) removes the wait, and needs a terminal.

The existing community plugin that syncs a vault with a WebDAV server, Remotely Save (0.5.25, last released October 2024), does not fit the drive. It puts the vault in a folder of its own at the server's root and creates it with `MKCOL`, its connection check makes a folder and a file with random names and reads the file back, it creates every local folder and uploads every file type, it decides what changed from size and server time, and it never renames: a rename is a delete and an upload (`src/fsWebdav.ts`, `src/fsAll.ts`, `pro/src/sync.ts` in `remotely-save/remotely-save`). The drive refuses a folder that is not an entity type (`plugins/webdav/src/dav-routes.ts`, `makeFolder`), stores some files in another form than they were sent, and a delete plus an upload is another entity.

What the drive already offers a sync client:

- A listing per folder with each file's ETag, which is the entity's content hash (`plugins/webdav/src/dav-tree.ts`, `fileOf`; `dav-xml.ts`).
- `PUT` with `If-Match` saves only over the version named and answers 412 otherwise; `If-None-Match: *` creates only if absent; `DELETE` with `If-Match` deletes only that version (`dav-saves.ts`).
- A save over a newer version can be kept as a conflict in the Inbox (`entities/conflict`).
- `MOVE` of a note onto another note's name renames the note (`renameNoteFile`, on #1028).
- App passwords, read-only or read-and-write, valid a year (`shell/auth-service/src/app-password-store.ts`).

What Obsidian offers a plugin, from its published API (`obsidianmd/obsidian-api`, `obsidian.d.ts`):

- `requestUrl` sends any method, headers and a text or binary body without the browser's cross-origin rules, and returns the status and headers. Remotely Save sends `PROPFIND` through it on iOS, so WebDAV's methods reach a server from the mobile apps.
- `Vault.on` reports `create`, `modify`, `delete` and `rename` with the old path.
- `Vault.process` rewrites a file atomically from its current text; `createBinary`, `modifyBinary` and `readBinary` handle images; `FileManager.trashFile` deletes as the person's settings say.
- `registerObsidianProtocolHandler` receives an `obsidian://` link; `loadData` and `saveData` keep the plugin's own state.

## Goal

A person installs one plugin in Obsidian, enters their brain's address, signs in, and works in a vault on their own disk that stays in step with the brain.

1. Obsidian is as fast as on any local vault, wherever the brain runs, and works offline.
2. Notes and images written in Obsidian become entries in the brain; entries changed in the brain appear in the vault.
3. Renaming a note in Obsidian renames the note in the brain.
4. An edit made in both places is never lost: the brain's version is in the vault, and the other is in the Inbox and in a `Conflicts` folder in the vault.
5. What the brain does not store stays in the vault, untouched and unsynced, and the plugin says which files those are.

It works on Obsidian's desktop and mobile apps.

## Non-goals

- No support for other sync plugins or for making the drive a general file store.
- No sync of `.obsidian`. Settings are per device; the drive keeps `.obsidian` for a mounted vault and that stays as it is.
- No end-to-end encryption. The brain reads what it stores.
- No merging of text inside a note. Two versions of one note are a conflict.
- Not part of stable 0.2.0. The drive's changes for it are additive and answer only a request that carries the sync header.
- No PDFs or other documents in the first version; the drive takes none (`dav-saves.ts`, "The drive cannot take documents").
- No folders for notes in the first version. A brain's notes are single files at the root (`shared/entity-placement/src/placement.ts`: a note is writable only with one id segment), so a note inside a folder that is not an entity type has no place in the brain.

## How it works

The plugin talks to the drive at `<brain>/dav/` over HTTPS with an app password, through Obsidian's `requestUrl`, which is not subject to the browser's cross-origin rules and exists on mobile.

### What is synced

| In the vault                                                  | In the brain                         |
| ------------------------------------------------------------- | ------------------------------------ |
| `Name.md` at the vault's root                                 | the note `Name`                      |
| `<type>/…/name.md` where `<type>` is a folder the drive lists | the entity of that type at that path |
| an image in `image/`                                          | the image entity                     |
| anything else                                                 | nothing; shown as local only         |

The plugin learns which folders are entity types from the drive's root listing, and re-reads it on every sync.

### State

Per synced path the plugin stores, in its own data file: the ETag the brain had when the two last agreed, and a hash of the local file at that moment. A file whose hash differs from the stored one was edited locally; an entry whose ETag differs was changed in the brain. Size and modification time decide nothing.

### One sync

A full sync runs when the vault opens, every five minutes, and on command. A save in Obsidian uploads that one file, without a listing.

```
list the drive: root, then each entity-type folder (PROPFIND, Depth 1)
for each path known to either side:

  local unchanged, brain unchanged      → nothing
  brain changed, local unchanged        → GET, write the file, store ETag and hash
  local changed, brain unchanged        → PUT If-Match: <stored ETag>
        204 with the stored version's ETag
              stored as sent            → store ETag and hash
              stored in another form    → write the stored form locally (see "Writing into the vault")
        412 (changed since the listing) → handle as "both changed"
        403 / 422                       → leave the file, show the reason on it
  both changed                          → copy the local text to Conflicts/, then PUT as a sync client
        kept as a conflict              → GET the brain's version, write it,
                                          notice: where the other version is
  new local file                        → PUT If-None-Match: *
        201                             → store
        412 (the name is taken)         → handle as "both changed"
        403 / 422                       → local only, with the reason
  new entry in the brain                → GET, create the file
  local file deleted, brain unchanged   → DELETE If-Match: <stored ETag>   (see "Deletes")
        412                             → the entry changed: GET it back
  entry deleted, local unchanged        → trash the file as the person's settings say
  entry deleted, local changed          → PUT If-None-Match: * (the edit survives as a new entry)
  401                                   → stop; status "sign in again"; nothing is changed
```

A request that fails for the network leaves the path as it was; the next sync tries again. A sync never runs twice at once.

### Deletes

A file missing from the vault deletes its entry only when the plugin saw the delete happen (`Vault.on('delete')`) or the person confirms it. A full sync that finds files missing without that event, as after a vault folder was emptied or restored from a backup, deletes nothing: it lists the entries and asks whether to delete them in the brain or download them again. The same question is asked when one sync would delete more than five entries.

### The first sync of a vault

Before anything is written on either side, the plugin shows what it will do and waits for a yes:

```
only in the brain                 → download
only in the vault, a place the brain has → upload as a new entry
only in the vault, no such place  → local only
in both, same text                → record as agreed
in both, different text           → the brain's version goes into the vault;
                                    the vault's file is moved to Conflicts/ first.
                                    Nothing is sent to the Inbox: these were never
                                    edits of the brain's version.
```

### The Conflicts folder

`Conflicts/` at the vault's root is not an entity type, so it is never uploaded. A local version that loses is copied there as `<name> <date and time>.md` before the brain's version replaces it. The Inbox holds the same text for an admin and for Studio's editor; the folder is what a person of any role has at hand in Obsidian.

### Writing into the vault

The plugin never writes into a note that is being typed in. A download or a stored form waits until the file has had no `modify` event for five seconds, and is written with `Vault.process`, which only replaces the text the plugin last saw: when the file changed again in between, nothing is written and the next sync compares anew.

### Images in notes

A brain's note refers to an image as `![alt](entity://image/<id>)` (`shell/entity-service/src/lib/content-resolver.ts`); Obsidian shows an embed of the file itself, as a Markdown image link to its path under `image/` or as `![[<file>]]`. The plugin translates between the two as a note passes through: on the way down, a reference to an image entity becomes a link to its file in `image/`; on the way up, an embed of a file in `image/` becomes a reference to that image's entity, uploaded first when it is new. The stored state keeps the brain's ETag and the hash of the translated local text, so the difference between the two forms is never taken for an edit. An embed of a file outside `image/` is left as it is and the note is marked: the brain cannot show that image.

### Renames

Obsidian tells a plugin about a rename with the old and the new path. The plugin sends `MOVE` for it before the next comparison.

```
note → another root name      → MOVE → 201: move the stored state to the new path
                                     → 412 (taken, or changed): undo the rename locally, notice
other type, or out of its folder → the drive answers 403: undo the rename locally, notice
```

A rename made while offline is replayed in order at the next sync.

### A save as a sync client

A desktop's WebDAV client cannot show a refusal, so the drive answers a losing save as saved and shows it back as sent for ten minutes (`dav-holds.ts`). A sync client wants the opposite: the truth at once. The plugin sends `X-Brain-Sync: 1` and the drive then:

- holds nothing back: the next read is the stored version;
- always answers a save with the stored version's `ETag`, and `X-Brain-Stored: as-sent` or `other-form`;
- keeps a save whose `If-Match` names an older version as a conflict instead of answering 412, when the request also carries `X-Brain-Keep: conflict`, and names it in `X-Brain-Conflict`.

Without the header the drive behaves as it does today.

### Signing in

First version: the person creates a read-and-write app password in Studio's Drive tab and pastes the user name and password into the plugin's settings. The plugin checks them with one listing and says what is wrong when it fails: wrong password, read-only password, no drive on this brain. An app password ends after a year or when it is revoked; the drive then answers 401, the plugin stops syncing, changes nothing on either side, and asks for a new one. Edits made meanwhile are uploaded after signing in again.

Later version: **Connect** in the plugin opens the brain in the browser, the person confirms there, and the brain hands a new app password back to Obsidian through an `obsidian://` link. No password is seen or pasted.

### What the person sees

- A status bar item: synced, syncing, offline, or a count of files that need attention.
- A notice when a version lost, naming its copy in `Conflicts/`.
- A list, from the status bar, of files that are local only and why (a folder the brain has no type for, a file type the brain does not store, a refusal by the brain with its message).
- Settings: the brain's address, the app password, sync on save, the interval, and **Sync now**.

On first connect to a vault that already holds files, the plugin lists what it would upload and what it would download, and starts only on confirmation.

## What changes in the brain

1. The sync-client mode on the drive described above (`plugins/webdav`).
2. Renaming a note updates what points at it by id: a pending conflict's target, a document generated from it, FAQ sources that cite it. Renaming itself is on #1028.
3. The drive's Drive tab in Studio gains a card for Obsidian that names the plugin and links to its install steps.

## The plugin's code

- `packages/obsidian-plugin` in this repository: TypeScript, bundled to the `main.js`, `manifest.json` and `styles.css` Obsidian loads.
- A sync engine with no Obsidian imports: it takes a vault interface (list, read, write, rename, trash) and a request function. Its tests run it against the drive's real routes in process (`createDavRoutes`) over the entity service, so the engine and the drive are tested together.
- A thin Obsidian shell: settings tab, status bar, commands, vault events.
- Desktop and mobile: no Node or Electron APIs (`isDesktopOnly: false`).

## Distribution

1. Release assets (`main.js`, `manifest.json`, `styles.css`) built by CI, installed by copying them into the vault's plugins folder or with BRAT. Enough for the first users.
2. A public repository that holds the built plugin and its releases, as Obsidian's community directory requires, then a submission to the directory. From then on it installs from inside Obsidian.

## Phases

One PR, a commit per phase, tests first in each.

1. **A vault that mirrors the brain's notes.** Settings with address and app password, the connection check with its failure messages, the first-sync summary, the engine's list and download for notes at the root. Read-only: nothing is uploaded. Tests: the engine against the drive in process; a note appears, changes and disappears in the vault as it does in the brain; a 401 stops the sync and changes nothing.
2. **Editing a note.** Upload of a saved note with `If-Match`, the sync-client mode on the drive, the stored form written back by the rules for writing into the vault. Tests: stored as sent, stored in another form, refused; a note typed in during the upload is not overwritten.
3. **Both sides changed.** The copy in `Conflicts/`, the conflict in the brain, the notice. Tests: the brain's version lands in the vault, one conflict and one copy hold the other; a repeat sync makes no second of either.
4. **New notes and deletes**, in both directions, with the delete rules. Tests: a delete seen by the plugin deletes the entry; files found missing delete nothing and ask; more than five deletes ask.
5. **The first sync of a vault that already holds files.** Tests: each row of the table, and that nothing is written before the yes.
6. **Renames.** `MOVE` from Obsidian's rename event, undo on refusal, offline replay; in the brain, the update of what points at a renamed note.
7. **Other entity types and images.** The type folders the drive lists, images in `image/`, the translation of image references, and the offer to make `image/` the vault's attachment folder.
8. **Local-only files made visible.** The status bar count and the list with reasons.
9. **Connect without a password**, and the Obsidian card in Studio's Drive tab.
10. **Distribution.** CI release assets, the public repository, the community directory submission, a check on iOS and Android.

## Validation

- Each phase: the plugin package's tests and the drive's tests, typecheck, lint.
- From phase 2 on, on the `personal` test app with Obsidian running on a hidden display against a local vault: edit in Obsidian and in Studio, together and apart, rename, delete, restart the brain mid-sync. Each ends with the vault and the brain agreeing and nothing lost.
- From phase 4 on: empty the vault folder with the plugin's state kept, and restore an older copy of the vault; neither deletes an entry without a yes.
- Before distribution: a vault on macOS against a deployed brain over a slow link, timed against the mounted drive.
