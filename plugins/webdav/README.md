# @brains/webdav

A brain as a network drive. The plugin serves the brain's entities over WebDAV on `/dav`, as the same folders and files `brain-data/` holds, so GNOME Files, davfs2, rclone, macOS Finder and Windows Explorer can mount it.

The drive is read-only today: browse and open files. Saving, creating and deleting follow in [the plan](../../docs/plans/webdav-mount.md).

## Enable

```yaml
add:
  - webdav
```

The brain needs its web bundle: the drive is served by the brain's own HTTP listener and signs people in through `auth-service`.

## Signing in

Mount clients send a username and password. A person creates an app password in Studio under Account → Drive; the generated username and password are shown once. The tab appears when this plugin is on, and also shows the drive address and the steps per client. An app password:

- works only on `/dav`: it is never a session or a bearer token;
- is read-only;
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

Files carry their `contentHash` as a strong ETag. Markdown is served as `text/plain`, and every response is marked `nosniff` and `Content-Security-Policy: sandbox`, because the drive shares its origin with Studio.

## Mount

- GNOME Files: connect to `davs://<host>/dav/`
- rclone: `rclone config create <name> webdav url=https://<host>/dav/ vendor=other user=<username> pass=<password> --obscure`, then `rclone mount <name>: ~/Brain --read-only`
