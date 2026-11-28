# The Drive and Obsidian

A brain can be mounted as a network drive. The drive serves the brain's entries over WebDAV on `/dav`, as the same folders and files `brain-data/` holds, so you can open and edit them in your computer's file manager or any editor. The Rizom Brain plugin for Obsidian uses the same drive to keep an Obsidian vault in step with the brain.

## Turning it on and off

The drive is the `webdav` capability, a member of the `web` bundle, so every brain that serves HTTP has it. It is served by the brain's own HTTP listener and signs people in through `auth-service`. A brain without `web` has no drive. To turn it off:

```yaml
remove:
  - webdav
```

The only setting is the largest markdown file a client may save:

```yaml
plugins:
  webdav:
    maxFileBytes: 5242880 # default, 5 MiB
```

## App passwords

File managers and mount tools send a username and password, not a passkey, so the drive signs in with app passwords. Create one in Studio under **Account → Drive** (Trusted and Admin people; Public accounts cannot). The generated username and password are shown once.

An app password:

- works only on `/dav`; it is never a Studio session or an MCP token;
- is read-only unless you create it with **Allow saving changes**;
- expires a year after it is created, and can be revoked in the same tab at any time;
- is refused over plain HTTP, except on `localhost`;
- stops working at once if its owner is suspended or lowered to Public.

Every request runs at the visibility of the app password's owner: a Trusted person sees public and shared entries, an Admin restricted ones too. Anything outside that is not listed and answers as a path that does not exist.

## Mounting the drive

**Account → Drive** shows the drive's address and the steps for each client. The address is `https://<your-brain>/dav/`.

| Client      | How to connect                                                                                                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS       | Finder → Go → Connect to Server → `https://<host>/dav/`                                                                                                                          |
| Windows     | File Explorer → This PC → Map network drive → `https://<host>/dav/`, with "Connect using different credentials"                                                                  |
| GNOME Files | Connect to `davs://<host>/dav/`                                                                                                                                                  |
| rclone      | `rclone config create <name> webdav url=https://<host>/dav/ vendor=other user=<username> pass=<password> --obscure`, then `rclone mount <name>: ~/Brain --vfs-cache-mode writes` |

davfs2 and other WebDAV clients work too.

## What the drive shows

```text
/dav/                          type folders and root-level notes
/dav/<type>/<a>/<b>.md         an entry of <type>, with id a:b
/dav/book/<book>/<section>.md  a contained type, inside its container's folder
/dav/image/<id>.<ext>          image files
/dav/document/<id>.pdf         document PDFs (read-only)
```

A folder exists while something you may see is inside it.

## How edits become entries

A file saved on the drive goes through the same checks as a Studio edit:

- The type's schema reads the file. A file it cannot read (frontmatter that is not YAML, a missing required field) is refused with the reason, and nothing changes.
- Your role's permissions apply. Moving an entry into a published status needs permission to publish. Refusals are recorded in the access log.
- A file that names no `visibility` keeps the stored one; a new file without one is public.
- A save that changes nothing writes nothing.

**Creating.** A new file creates the entry its path names: `post/first.md` is the post `first`, and a file at the root is a note. The path must be one `brain-data/` could hold, and the id must be free. A new folder is only a place to save into until an entry is saved inside it.

**Deleting.** Deleting a file deletes its entry, if your role may delete it. A folder goes when the last entry inside it does.

**Renaming.** Renaming a note's file renames the note: it keeps its text, metadata and visibility, and only its id changes. Renaming other types' files, and copying entry files, is refused.

**Images.** A PNG, JPEG, GIF or WebP saved in `image/`, up to 25 MiB, is stored as an image entry. Replacing an image keeps its title, alt text and visibility.

**Conflicts.** A save only goes through over the version it was based on. A save made over a version that changed since you last read it is not written over the newer one: it is kept as a conflict in the brain's Inbox, where an Admin can apply it or keep the current version (see [Studio](./studio.md#the-inbox)). The newer version stays in place until then.

Editor swap files, backups and the hidden folders desktops write (such as macOS's `.Trashes`) are kept in memory for the person who wrote them for ten minutes, and never become entries.

## Obsidian

### The Rizom Brain plugin

The Rizom Brain plugin for Obsidian keeps a vault on your own device in step with the brain. Obsidian stays as fast as with any local vault and works offline; the plugin syncs in the background through the drive. It needs a brain at version 0.2.0-alpha.769 or later with its drive on.

To install it until it is listed in Obsidian's community directory, download the `rizom-brain` artifact of the latest "Obsidian plugin" workflow run in the brains repository, copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/rizom-brain/`, and turn it on under Settings → Community plugins.

To connect it:

1. In the plugin's settings, enter the brain's address.
2. Choose **Connect**. The brain opens in the browser on **Account → Drive**; confirm there.
3. The brain creates an app password that may save changes and hands it back to Obsidian. You can also create one yourself in the Drive tab and enter its username and password.

The first sync shows what it will download, upload and replace, and starts only when you say yes.

### What it syncs

| In the vault                                   | In the brain                        |
| ---------------------------------------------- | ----------------------------------- |
| `Name.md` at the top of the vault              | the note `Name`                     |
| `<type>/…/name.md` in a folder the brain lists | the entry of that type at that path |
| an image in `image/`                           | the image                           |
| anything else                                  | nothing; it stays in the vault only |

Files that stay in the vault only are listed, with the reason, from the status bar. Notes in folders of your own, PDFs and canvases are not synced.

- Changes made in the brain reach the vault in about a second: the plugin asks the drive what changed, and the brain answers when something does.
- Renaming a note renames it in the brain. A rename the brain refuses is undone, with a notice.
- When a note changed in both places, the brain's version goes into the vault; yours is copied to `Conflicts/` in the vault and kept in the brain's Inbox.
- A file deleted in Obsidian is deleted in the brain. Files that went missing some other way, and more than five deletions at once, are deleted only after you confirm.
- An image a note embeds from `image/` becomes the brain's image reference (`entity://image/<id>`), and back.

### Templates, fileClasses and bases

The drive describes the brain's types to sync clients, and the plugin writes `_obsidian/` in the vault from that description: a template and a fileClass per type, and a base per type plus `Settings.base` and `Pipeline.base`. Templates and fileClasses follow the brain. A base is yours once you change it; one you never changed follows the brain and gains new types.

The plugin points Obsidian's Templates at `_obsidian/templates` unless you already chose a folder. Dropdowns from the fileClasses need the Metadata Menu plugin, with its class files path set to `_obsidian/fileClasses`.

Earlier versions wrote `_obsidian/` from the brain itself, through an `obsidian-vault` capability. That capability is retired: a brain no longer writes `_obsidian/` into `brain-data/` (files already there are left alone), and a `brain.yaml` that still adds `obsidian-vault` boots with a warning that the name is ignored.

### Obsidian's own settings

When the drive is opened directly as a vault, Obsidian keeps its settings, open tabs and plugins in `.obsidian` at the root. The drive keeps that folder for each person, never as an entry, stored with the brain's runtime state, so it survives restarts and is there from that person's other devices. Each person's `.obsidian` holds up to 32 MiB.

With the plugin, `.obsidian` is the local vault's own folder and is not synced. The plugin stores its app password and sync record in its `data.json` there, unencrypted like any plugin's settings; revoke the app password in **Account → Drive** if a device is lost.

## Related docs

- [Studio](./studio.md)
- [Content Management](./content-management.md)
- [Directory Sync Git Overview](./directory-sync-git.md)
