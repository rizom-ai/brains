# Brain Sync for Obsidian

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
- Renaming a note renames it in the brain. A rename the brain refuses is undone, with a notice.
- When a note changed in both places, the brain's version goes into the vault; the other is copied to `Conflicts/` and kept in the brain's Inbox.
- A file deleted in Obsidian is deleted in the brain. Files that went missing without Obsidian seeing it (an emptied folder, a restored backup), and more than five deletions at once, are deleted only after you say so.
- The first sync of a vault shows what it will download, upload and replace, and starts only on a yes.
- An image a note embeds from `image/` becomes the brain's image reference (`entity://image/<id>`), and back.

## Install

Until it is in Obsidian's community directory: download the `brain-sync` artifact of the latest "Obsidian plugin" workflow run, or build it (`bun run build` in this package), then copy `dist/main.js`, `dist/manifest.json` and `dist/styles.css` into `<vault>/.obsidian/plugins/brain-sync/` and turn it on under Settings → Community plugins.

## Connect

In the plugin's settings, enter the brain's address and choose **Connect**. The brain opens in the browser, on the Drive section of your account; confirm there, and the brain creates an app password that may save changes and hands it back to Obsidian. You can also create such an app password yourself in the Drive section and enter its username and password.

## Code

- `src/engine/`: the sync engine, with no Obsidian imports. It takes a vault (`SyncVault`) and a drive client.
- `src/obsidian/`: the plugin around it: settings, status bar, commands, dialogs and vault events.
- `test/`: the engine against a real brain in process: the note, image and conflict packages and the drive, over an entity store on disk.
