# Rizom Brain for Obsidian

An Obsidian plugin that keeps a vault on your own disk in step with your brain. Obsidian stays as fast as with any local vault and works offline; the plugin syncs in the background through the brain's drive (`plugins/webdav`).

## What it syncs

The brain's structure leads. The vault mirrors it:

| In the vault                                   | In the brain                        |
| ---------------------------------------------- | ----------------------------------- |
| `Name.md` at the top of the vault              | the note `Name`                     |
| `<type>/…/name.md` in a folder the brain lists | the entry of that type at that path |
| an image in `image/`                           | the image                           |
| anything else                                  | nothing: it stays in the vault only |

Files that stay in the vault only are listed, with the reason, from the status bar.

- A version is told by the brain's ETag and a hash of the vault's file, never by size or time.
- Files that only need fetching are fetched six at a time, so a first sync with a brain far away takes a fraction of the time it would one by one.
- Changes made in the brain arrive as they happen: the plugin asks the drive what changed (`.brain/changes`), the brain holds the ask until something does, and only the folders of the types that changed are listed again. After a gap in asking, or when the brain cannot place the plugin's cursor, everything is compared. Everything is also compared when the vault opens and every 30 minutes; every five at most while the brain cannot be asked for changes.
- Renaming a note renames it in the brain. A rename the brain refuses is undone, with a notice.
- When a note changed in both places, the brain's version goes into the vault; the other is copied to `Conflicts/` and kept in the brain's Inbox.
- A file deleted in Obsidian is deleted in the brain. Files that went missing without Obsidian seeing it (an emptied folder, a restored backup), and more than five deletions at once, are deleted only after you say so.
- The first sync of a vault shows what it will download, upload and replace, and starts only on a yes.
- An image a note embeds from `image/` becomes the brain's image reference (`entity://image/<id>`), and back.
- The brain describes its types (`.brain/vault-shapes.json` on the drive), and the plugin writes `_obsidian/` from it: a template and a fileClass per type, kept as the brain writes them, and a base per type plus `Settings.base` and `Pipeline.base`, yours once you change them: one you never changed follows the brain, so it gains new types. Files of a type the brain no longer has are removed, except a base you changed. If these files cannot be written, notes still sync and the reason is listed. Obsidian's Templates is pointed at `_obsidian/templates` unless you chose a folder. Dropdowns from the fileClasses need the Metadata Menu plugin, with its class files path set to `_obsidian/fileClasses`.

## Install

Until it is in Obsidian's community directory: download the `rizom-brain` artifact of the latest "Obsidian plugin" workflow run, or build it (`bun run build` in this package), then copy `dist/main.js`, `dist/manifest.json` and `dist/styles.css` into `<vault>/.obsidian/plugins/rizom-brain/` and turn it on under Settings → Community plugins.

## Publishing

Obsidian reads a community plugin from its own public repository, `rizom-ai/obsidian-rizom-brain`. `public/README.md`, `manifest.json`, `versions.json` and the license are that repository's root (`bun scripts/public-repo.ts` assembles them), and the built plugin goes into a release there, tagged with the manifest's version. That repository's "Release" workflow does both when started by hand: it checks this repository out, runs this package's tests, builds, and publishes with its own permissions, so no token is kept anywhere. It has a dry run that lists what it would publish. The plugin has its own version line (Obsidian takes only `x.y.z`), apart from this repository's shared version; the public README says which brain version it needs. To release, raise `version` in `manifest.json` (and add it to `versions.json` when `minAppVersion` changes), merge, and start that workflow.

## Connect

In the plugin's settings, enter the brain's address and choose **Connect**. The brain opens in the browser, on the Drive section of your account; confirm there, and the brain creates an app password that may save changes and hands it back to Obsidian. You can also create such an app password yourself in the Drive section and enter its username and password.

## Code

- `src/engine/`: the sync engine, with no Obsidian imports. It takes a vault (`SyncVault`) and a drive client.
- `src/obsidian/`: the plugin around it: settings, status bar, commands, dialogs and vault events.
- `test/`: the engine against a real brain in process: the note, image and conflict packages and the drive, over an entity store on disk.
