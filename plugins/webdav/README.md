# @brains/webdav

A brain as a network drive. The plugin serves the brain's entities over WebDAV on `/dav`, as the same folders and files `brain-data/` holds, so GNOME Files, davfs2, rclone, macOS Finder and Windows Explorer can mount it.

The drive browses, opens, saves, creates and deletes markdown files and images, and offers the locks macOS Finder and Windows need to mount it writable. Documents (PDFs) are read-only.

## Enable

The drive is part of the `web` bundle, so every brain that serves HTTP has it: it is served by the brain's own HTTP listener and signs people in through `auth-service`. A brain without `web` has no drive. To turn it off:

```yaml
remove:
  - webdav
```

## Signing in

Mount clients send a username and password. A person creates an app password in Studio under Account → Drive; the generated username and password are shown once. The tab appears when this plugin is on, and also shows the drive address and the steps per client. An app password:

- works only on `/dav`: it is never a session or a bearer token;
- is read-only unless created with "Allow saving changes";
- expires a year after creation and can be revoked at any time;
- is refused over plain HTTP, except on `localhost`;
- cannot be created by a public-level account.

## What the drive shows

```text
/dav/                          type folders + root-level notes
/dav/<type>/<a>/<b>.md         entity <type>, id a:b
/dav/book/<book>/<section>.md  a contained type, inside its container's folder
/dav/image/<id>.<ext>          image bytes
/dav/document/<id>.pdf         document PDF
```

Paths come from `@brains/entity-placement`, the same placement directory-sync writes `brain-data/` with. One name can differ: an image that `brain-data/` still keeps as a markdown file holding its data URL (`image/cover.md`) is on the drive as the image itself (`image/cover.png`).

Every request runs at the visibility scope of the app password's owner: a trusted person sees public and shared entities, an admin restricted ones too. Anything outside the scope is not listed and answers 404, as a path that does not exist. A folder exists while something the caller may see is inside it.

## Saving

A save goes through what a Studio edit goes through:

- the type's adapter reads the document; one it cannot read (a schema it fails, frontmatter that is not YAML) answers 422 with the reason and changes nothing;
- the entity action policy and the visibility policy apply at the saver's permission level, and moving into a published status needs the publish action; a refusal answers 403 and is recorded in the audit log;
- a file that names no `visibility` keeps the stored one;
- the write only goes through over the version it was based on: the one `If-Match` names, or else the one this app password last read or saved. A save naming an older version answers 412. A save naming none, over a newer version than this app password last had, is kept as a conflict in the Inbox, where it can be applied or dismissed, and answers 204; the newer version stays;
- a markdown file larger than `maxFileBytes` (default 5 MiB) answers 413;
- a save that changes nothing succeeds and writes nothing.

### Saves shown back as sent

rclone reads a file's size back after it uploads it, and takes any other size as a corrupted upload: it deletes the file and uploads it again, with a growing wait, for as long as the drive is mounted. A save the drive answers as saved but does not store as sent, because it is kept as a conflict or stored in another form (frontmatter written differently, a blank line dropped), would be such an upload.

So for ten minutes after such a save, the app password that sent it reads that file (GET, HEAD and PROPFIND) as it was sent, with the size it had. Nothing else changes: every other app password, Studio and the brain itself have the stored version, and nothing of the held save is stored. The hold:

- ends early once the entity changes again, or once the conflict that keeps the save is applied or dismissed;
- ends when the same app password saves the file again and it is stored as sent, or deletes it;
- is in memory, at most 16 MiB per app password, and a restart ends it;
- does not move what the app password last read: a save made from the held text is based on the version the held save lost to, so it is kept as another conflict, never written over the newer version. The held file's ETag stands for that same version.

Ten minutes outlasts rclone's defaults: it uploads a closed file after 5 seconds (`--vfs-write-back`), reads its size back at once, and then trusts its listing for 5 minutes (`--dir-cache-time`). Within the hold, the listing rclone fetches after that still agrees with the upload it verified. After the hold, the next listing has the stored size, and the mount reads the stored version.

rclone tells versions apart by size alone. When the stored version has the same size as the save that was held, rclone does not see the change after the hold ends and keeps showing the held text from its cache until it drops that file (`--vfs-cache-max-age`, an hour by default) or is remounted. Saving from that text is kept as a conflict, as above.

Editors and desktops write their own files on a mounted drive: swap files, backups, a temporary file renamed onto the real one, and macOS's hidden folders (`.Trashes`, `.TemporaryItems`). Any name that is a dot file or does not end in an entity's extension, and anything inside a hidden folder, is such a file. It is kept in memory for the person who wrote it, for ten minutes after its last use and 16 MiB at most, and is never an entity. Renaming one onto an entity's file is a save.

One hidden folder is kept instead of forgotten: `.obsidian` at the root, where Obsidian holds a vault's settings, open tabs and plugins when the drive is opened as a vault. It is still the person's own and never an entity, but it is stored with the brain's runtime state, so it is there after ten minutes, after a restart and from that person's other devices. One person's `.obsidian` holds 32 MiB at most.

## Creating and deleting

A new file creates the entity its path names, only if none is there yet: `post/first.md` is the post `first`, a file at the root is a note. The path must be one `brain-data/` could hold; any other answers 403. A file that names no `visibility` is public, as an imported file is. An id already taken, by an entity the person may see or not, answers 412. `If-None-Match: *` saves only if no file is there.

A file is created inside a folder that exists. A new folder (`MKCOL`) is only a place to save into: it is the person's own, in memory, until an entity is saved inside it, and that entity's id is what makes the folder real. A folder at the root must be an entity type.

Deleting a file deletes its entity, under the delete action policy and only while it is still the version read. A folder cannot be deleted; it goes when the last entity inside it does.

rclone takes a save the drive refuses as a failed upload and deletes the file to clean up after it. It would do the same after a save kept as a conflict or stored in another form, were that save not shown back as sent (see Saving). The first delete without `If-Match` that the same person sends for that file within 30 seconds of such a save answers 409 and keeps the entity; a second delete, or one naming the version, deletes it.

Renaming a note's file renames the note: a notes app shows a file's name as the note's, and a note's file name is its id. The note keeps its text, its metadata, its visibility and the day it was made; only its id changes, in one step, so its embedding and its place in topics are kept and not worked out again. The new name must be free (412 when it is taken, whatever `Overwrite` says), the note must be the version the request found (412), and the person must be allowed to update it. In `brain-data/` the file moves, and git records a rename.

Renaming any other type's file and copying entity files answer 403, with one exception: renaming an entity's file onto a temporary name (`note.md` → `note.md~`) is an editor making its backup before it saves. The file's bytes are copied to the person's temporary files and the entity stays, for the save that follows to replace. Refusing that rename makes neovim copy the file and delete the original, which would delete the entity.

## Images

An image file in `image/` is saved the way a file dropped into `brain-data/image/` is imported: its bytes say what it is, they are stored as an asset, and the image entity that references them is written with them. Replacing an image keeps its title, alt text and visibility. The bytes must be a PNG, JPEG, GIF or WebP of at most 25 MiB, under the extension that format is stored with (`.png`, `.jpg`, `.gif`, `.webp`); anything else answers 422 and stores nothing. So does the old 1x1 placeholder PNG saved over an image still awaiting its bytes. An image or document is never saved as a `.md` text file: that answers 403.

## Locks

The drive is a WebDAV class 2 server: `LOCK` grants an exclusive write lock on a path, for ten minutes at most, refreshable by its holder, and `UNLOCK` releases it. While a path is locked, a write to it needs the lock's holder and its token (`If: (<token>)`), or answers 423. Locks are advisory and held in memory; a restart drops them. What keeps saves correct is the version check each write makes.

Files carry their `contentHash` as a strong ETag. Markdown is served as `text/plain`, and every response is marked `nosniff` and `Content-Security-Policy: sandbox`, because the drive shares its origin with Studio.

## Mount

- macOS: Finder → Go → Connect to Server → `https://<host>/dav/`
- Windows: File Explorer → This PC → Map network drive → `https://<host>/dav/`, with "Connect using different credentials"
- GNOME Files: connect to `davs://<host>/dav/`
- rclone: `rclone config create <name> webdav url=https://<host>/dav/ vendor=other user=<username> pass=<password> --obscure`, then `rclone mount <name>: ~/Brain --vfs-cache-mode writes`
