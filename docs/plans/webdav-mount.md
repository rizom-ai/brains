# WebDAV mount: a brain as a network drive

Last updated: 2026-11-17

## Status

Proposed. No implementation has started.

## Goal

A signed-in person mounts a brain as a network drive in GNOME Files, davfs2, rclone, macOS Finder or Windows Explorer. The drive shows the same folders and markdown files as `brain-data/`, limited to what that person may see. Opening a file reads the entity; saving it writes the entity through the same validation, permission and concurrency checks as Studio.

## Decisions

### A first-party `webdav` plugin on `/dav`

`plugins/webdav` is a service plugin a brain opts into with `add: [webdav]`. It needs an HTTP bundle and `auth-service` (the web bundle). It serves the whole tree under `/dav` and is not served on the preview host.

Every WebDAV method is one `withWebRoutes` route on `/dav` with `match: "prefix"` and `public: true`, and the handler authenticates the request itself, the same pattern as `/mcp` and the Studio editor routes. The handler parses and decodes `new URL(request.url).pathname` itself.

### Shell: WebDAV methods on web routes

`WebRouteMethods` (`shell/plugins/src/types/web-routes.ts`) gains `HEAD`, `PROPFIND`, `PROPPATCH`, `MKCOL`, `COPY`, `MOVE`, `LOCK` and `UNLOCK`. The registry's method check and the `WebRouteMethod` type follow from the list. `Bun.serve` passes all eight verbs through to the handler.

Tool routes (`api-routes.ts`) and the public declarative route contract (`route-definition-contract.ts`) keep their method lists: WebDAV is a first-party web route, and the stable 0.2 public surface does not change.

### One placement implementation for `brain-data/` and the drive

The pure path functions in `plugins/directory-sync/src/lib/entity-paths.ts` (`parseEntityPath`, `buildEntityFilePath`, `resolveEntityPlacement`, `getEntityFileExtension`, `containmentOf`) move to a new shared package, `@brains/entity-placement`, together with what they import: the image and document extension lists (`IMAGE_EXTENSIONS`, `getExtensionForFormat`, `DOCUMENT_EXTENSIONS`) and the relative-path helper. The package works on sync-relative paths only; directory-sync joins its own `syncPath` on the way in and out, and the WebDAV plugin uses the path below `/dav` as is. directory-sync and the WebDAV plugin both import it, so a file has the same path on the drive, in `brain-data/` and in the content repo. directory-sync keeps answering `sync:path:request` through the same functions.

### App passwords

Mount clients other than rclone send only HTTP Basic credentials, and a brain has no long-lived credential today: passkey sessions last 12 hours and OAuth access tokens 15 minutes. auth-service gains app passwords:

- A trusted or admin user creates one in Studio's Account workspace, with a label and an access mode: **read-only** (the default) or **read and write**. Public-level users cannot create one.
- A read-only app password answers every writing method (PUT, DELETE, MKCOL, MOVE, COPY, PROPPATCH, LOCK) with 403, scratch files included.
- An app password expires one year after creation. The Drive tab shows the expiry date; an expired password stops resolving and is replaced by creating a new one.
- An app password is refused over plain HTTP unless the request host is `localhost` or a loopback address: Basic credentials travel on every request.
- The username is generated (`dav-<id>`) and the password is 32 random bytes, base64url. Both are shown once; the runtime database stores the id, the user, the label, the access mode, `hashToken(password)`, `createdAt`, `expiresAt`, `lastUsedAt` and `revokedAt`.
- An app password is accepted only by the WebDAV routes, through a new `AuthBackend.resolveAppPassword(request)` that returns the principal of an active user. Chat, MCP, Studio and the OAuth endpoints never accept it.
- The principal's level decides everything, exactly as a session would: visibility scope (admin → restricted, trusted → shared) and per-type action policy. Suspending the user stops every app password at once.
- Revoking is immediate. Creating, revoking and first use after creation are audit events.
- No lockout: the password is not user-chosen, and 32 random bytes are not guessable.

A failed or missing credential returns 401 with `WWW-Authenticate: Basic realm="<brain name>"`.

### Account → Drive tab

Studio's Account workspace gets a **Drive** tab next to AI tools. The `webdav` plugin registers a `webdav` interaction in the app info, as the MCP interface registers `mcp`; Studio resolves it against the issuer origin and passes it to the Account bootstrap as `davUrl`, and without it the tab is not rendered. The tab shows the mount address (`<issuer>/dav/`), the person's app passwords (label, access mode, created, expires, last used, revoke), a create button that shows the new username and password once with copy buttons, and one card per client: GNOME Files (`davs://<host>/dav/`), davfs2 (`/etc/fstab` line and `secrets` entry), rclone (`rclone config` WebDAV remote, vendor `other`, then `rclone mount --vfs-cache-mode writes`), macOS Finder (Connect to Server) and Windows (Map network drive). The tab is deep-linkable with `?section=drive`.

### The tree

```text
/dav/                         type folders + root-level notes (note entities)
/dav/<type>/                  subfolders (id segments) + entity files
/dav/<type>/<a>/<b>.md        entity <type>, id a:b
/dav/book/<book>/<section>.md contained type: book-section, id <book>:<section>
/dav/image/<id>.<ext>         image bytes
/dav/document/<id>.pdf        document PDF, read-only
```

- Which entity a path names, and which path an entity has, is whatever `@brains/entity-placement` says. A contained type (`containedIn`, such as `book-section` in `book`) has no folder of its own: its entities live inside their container's folder.
- The root lists every entity type that is not contained and has at least one entity visible at the caller's scope (`getEntityCounts(scope)`), or whose contained type has one, plus root-level notes.
- A type folder lists its subfolders and entities through `queryEntityHierarchy`, paged internally until complete. A container's folder merges its own hierarchy with its contained type's at the same prefix.
- An entity whose placement is not writable (a historical invalid id that directory-sync refuses to export) is not on the drive.
- A path that does not exist, or that the caller may not see, is 404: hidden entities do not leak as 403.
- Files carry `getetag` = the quoted `contentHash`, `getcontentlength`, `getlastmodified` = `updated`, and `resourcetype`. `PROPPATCH` answers 403 per property: properties are not stored.
- `PROPFIND` with `Depth: infinity` is 403 (RFC 4918 `propfind-finite-depth`); depths 0 and 1 are served.
- Document sidecar JSON files are not shown.

### Request flows

**GET / HEAD file**

```text
auth ─fail→ 401
path → (type, id) ─no parse→ 404
getEntityRaw({ source: true, visibilityScope }) ─absent/hidden→ 404
image/document → stream openAsset
else → stored markdown as text/plain; charset=utf-8, ETag = "contentHash"
```

Every `/dav` response carries `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox`. `/dav` shares its origin with Studio and the session cookie, so nothing it serves may run as a page there: an SVG image or an HTML scratch file opened in a browser stays inert. Scratch files are served as `application/octet-stream` with `Content-Disposition: attachment`.

**PUT existing file**

```text
auth ─fail→ 401
body > maxFileBytes → 413
type document → 403
deserializeEntity(markdown, type) ─EntityValidationError→ 422, entity unchanged
action policy (update; publish when status crosses the publish boundary) ─deny→ 403
visibility policy ─deny→ 403
updateEntity({ expectedContentHash })
   If-Match given    → expectedContentHash = If-Match
   no If-Match       → expectedContentHash = hash read at request start (last write wins, atomically)
   ─hash mismatch→ 412
→ 204, audit event
   stored markdown equals the uploaded bytes → ETag = new contentHash
   otherwise                                 → no ETag; the client re-reads
```

The entity service stores `serializeEntity` output, so the stored markdown can differ from the upload (frontmatter order, applied visibility). A PUT response names an ETag only for bytes the client already holds.

**PUT new file**

```text
resolveEntityPlacement(type, id) ─not writable / no round trip→ 403
policy checks as above
createEntityFromMarkdown({ conditionalWrite: { expectedRevision: null } }) ─exists→ 412
→ 201
```

**DELETE file**

```text
action policy (delete) ─deny→ 403
deleteEntity({ expectedContentHash: If-Match }) ─mismatch→ 412
→ 204, audit event
```

A collection DELETE is 403: a folder disappears when its last entity is deleted.

Writes carry `eventContext.interfaceType: "webdav"` and the acting user. directory-sync then exports them to `brain-data/` and git as it does any other change.

### Editor temporary files

Editors save through files that are not entities: `.goutputstream-*` (GNOME), `.swp`/`.swx`/`~` backups (vim), `.~lock.*#`, `._*` and `.DS_Store` (macOS), and `*.tmp`/`.<name>.<random>` (VS Code and others).

- Any path that `parseEntityPath` rejects, or whose leaf starts with `.` or ends with `~`, `.tmp`, `.swp` or `.swx`, lives in a per-user scratch area: in memory, 10-minute idle expiry, 16 MiB per user. It supports GET, HEAD, PUT, DELETE, PROPFIND (listed beside real files) and MOVE.
- `MOVE` from a scratch file onto an entity path is a PUT of the scratch content onto that entity, with the same flow, and removes the scratch file. This is how atomic-rename saves work.
- `MOVE` or `COPY` between two entity paths is 403: renames stay in Studio and chat.
- `MKCOL` creates a scratch folder, which shows until it expires or a file is saved inside it. On a folder that already exists, real or scratch, it is 405, which clients that create parent folders before every upload (rclone) take as success.
- Scratch state is lost on restart; only unsaved editor temporaries live there.

### Locking

`OPTIONS` advertises `DAV: 1` until Phase 4 ships and `DAV: 1, 2` from then on, so davfs2 does not attempt locks before they exist. `LOCK` and `UNLOCK` keep advisory exclusive write locks in memory, per path, with the requested timeout capped at 10 minutes. A PUT, DELETE or MOVE onto a path locked by another lock token is 423. Finder and Windows mount read-only without class 2, so the locks exist for them; correctness still rests on the ETag checks.

### Limits

`maxFileBytes` defaults to directory-sync's `maxImportFileBytes`. Image PUTs stream into `stageAsset`, as directory-sync's image import does.

## Phases

One PR (`work/webdav-mount`, worktree `~/Documents/brains-worktrees/webdav-mount`), one commit per phase, tests first in each, and a changeset.

### Phase 1 — read-only mount

1. Tests: the registry accepts the eight new methods on web routes and still rejects them on tool routes; `@brains/entity-placement` passes directory-sync's existing placement tests (including the golden inventory) unchanged; app passwords create, resolve, revoke, expire after a year, are refused over plain HTTP off loopback, and stop resolving for a suspended user, and are rejected by `resolveSession`, `resolveBearerGrant` and `/mcp`; the WebDAV handler answers `OPTIONS`, `PROPFIND` (depth 0 and 1, 403 on infinity), `GET` and `HEAD` at each permission level, with 404 for hidden entities, `DAV: 1`, and the `nosniff` and `sandbox` headers on every response; a container folder lists its contained type's entities, a contained type has no root folder, and an unplaceable entity is absent; the Account Drive tab renders only when the `webdav` interaction is registered.
2. Implement the method list, the package move, app passwords and their runtime migration, the read routes, image and document streaming, the Drive tab, and the canonical capability entry.
3. Verify: with the routes deployed to a pilot brain, `PROPFIND` reaches the handler through Cloudflare. Start the `personal` test app, create an app password in Studio, mount it with GNOME Files and with `rclone mount`, browse and open notes and images.

### Phase 2 — edit existing files

1. Tests: every writing method is 403 with a read-only app password; PUT existing with and without `If-Match`; 422 on invalid frontmatter leaves the entity unchanged; 403 on policy; 412 on a stale hash; 413 over the limit; the PUT response carries an ETag only when the stored markdown equals the upload; scratch PUT/GET/PROPFIND/DELETE and expiry, served as an attachment; MOVE scratch → entity saves; MOVE entity → entity is 403.
2. Implement.
3. Verify: edit and save a note in GNOME Text Editor, vim and VS Code on the mounted drive; the change appears in Studio and `brain-data/`.

### Phase 3 — create and delete

1. Tests: PUT new at a writable path creates; at an unwritable path is 403; PUT onto an existing id through the create path is 412; DELETE with and without `If-Match`; collection DELETE is 403; MKCOL scratch folder then a file inside creates the entity; MKCOL on an existing folder is 405.
2. Implement.
3. Verify: create a note in a new subfolder and delete another from GNOME Files.

### Phase 4 — locking and image writes

1. Tests: `OPTIONS` advertises `DAV: 1, 2`; LOCK/UNLOCK, timeout cap, 423 on a foreign lock token; image PUT stages an asset and replaces the image entity; document PUT is 403.
2. Implement.
3. Verify: mount writable in macOS Finder and Windows Explorer against a deployed brain; copy an image onto `image/`.

## Validation

- The affected workspaces' typecheck, lint and tests (shell plugins, core, auth-service, directory-sync, studio, the new plugin and package), plus `typecheck:scripts` and brain-cli `bun run test`.
- Each phase's mount check on the `personal` test app; phase 4 on a deployed brain over HTTPS.
