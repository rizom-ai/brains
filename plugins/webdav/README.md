# @brains/webdav

A brain as a network drive. The plugin serves the brain's entities over WebDAV on `/dav`, as the same folders and files `brain-data/` holds, so GNOME Files, davfs2, rclone, macOS Finder and Windows Explorer can mount it.

Today the drive browses, opens, saves, creates and deletes markdown files. Saving images and documents, and the locking macOS Finder and Windows need to mount writable, follow in [the plan](../../docs/plans/webdav-mount.md).

## Enable

```yaml
add:
  - webdav
```

The brain needs its web bundle: the drive is served by the brain's own HTTP listener and signs people in through `auth-service`.

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
- the write only goes through over the version it was based on (`If-Match`, or the version read when the save arrived); otherwise it answers 412;
- a file larger than `maxFileBytes` (default 5 MiB) answers 413.

Editors save through their own files: swap files, backups, and a temporary file renamed onto the real one. Any name that is a dot file or does not end in an entity's extension is such a file. It is kept in memory for the person who wrote it, for ten minutes after its last use and 16 MiB at most, and is never an entity. Renaming one onto an entity's file is a save.

## Creating and deleting

A new markdown file creates the entity its path names, only if none is there yet: `post/first.md` is the post `first`, a file at the root is a note. The path must be one `brain-data/` could hold; any other answers 403. A file that names no `visibility` is public, as an imported file is. An id already taken, by an entity the person may see or not, answers 412. `If-None-Match: *` saves only if no file is there.

A file is created inside a folder that exists. A new folder (`MKCOL`) is only a place to save into: it is the person's own, in memory, until an entity is saved inside it, and that entity's id is what makes the folder real. A folder at the root must be an entity type.

Deleting a file deletes its entity, under the delete action policy and only while it is still the version read. A folder cannot be deleted; it goes when the last entity inside it does.

Renaming and copying entity files answer 403.

Files carry their `contentHash` as a strong ETag. Markdown is served as `text/plain`, and every response is marked `nosniff` and `Content-Security-Policy: sandbox`, because the drive shares its origin with Studio.

## Mount

- GNOME Files: connect to `davs://<host>/dav/`
- rclone: `rclone config create <name> webdav url=https://<host>/dav/ vendor=other user=<username> pass=<password> --obscure`, then `rclone mount <name>: ~/Brain --vfs-cache-mode writes`
