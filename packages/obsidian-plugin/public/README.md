# Rizom Brain

Keep an Obsidian vault on your own device in step with your Rizom brain. Obsidian stays as fast as with any local vault and works offline; notes and images sync in the background.

You need a Rizom brain at version 0.2.0-alpha.769 or later with its drive turned on, and an account on it. With an older brain the plugin cannot sync.

## What it does

- Notes and images go both ways between the vault and your brain. A change made in your brain reaches the vault in about a second.
- Your vault mirrors your brain: notes at the top, other entries in a folder per type. A file your brain has no place for stays in the vault only, and is listed with the reason.
- Renaming a note here renames it in your brain. A rename your brain cannot take is undone, with a notice.
- When a note was changed here and in your brain, your brain's version goes into the vault. Yours is copied to `Conflicts/` and kept in your brain's Inbox. Nothing is lost.
- A note deleted here is deleted in your brain. Files that went missing some other way, and more than five deletes at once, wait for your yes.
- The first sync shows what it will download, upload and replace, and starts only when you say so.
- Your brain's templates, field definitions and table views are written to `_obsidian/`.

## Set it up

1. Install the plugin and turn it on.
2. In its settings, enter your brain's address, for example `yourname.rizom.ai`.
3. Choose **Connect**. Your brain opens in the browser; confirm there. The plugin gets its own app password, which you can revoke in your brain under Account, Drive.

## What it sends, stores and changes

- **Network.** The plugin talks only to your brain's address, the one you enter. It sends and fetches your notes and images there, and nothing anywhere else. No telemetry, no analytics, no ads.
- **Account.** It needs an account on your brain, and signs in with an app password made for it.
- **Stored on your device.** The app password and the record of what was synced are kept in the plugin's `data.json` in this vault's configuration folder, unencrypted, like any plugin's settings. Anyone who can read your vault folder can read it. Revoke the app password in your brain if a device is lost.
- **Changes outside your notes.** It writes `_obsidian/` and `Conflicts/` in the vault. Once, if you have not chosen a template folder, it points Obsidian's Templates at `_obsidian/templates`.

## Not yet

- Notes in folders of your own, PDFs and canvases are not synced. They stay in the vault.
- Obsidian's own settings are not synced between devices.

## Source and license

The source is in the brains repository, under `packages/obsidian-plugin`: https://github.com/rizom-ai/brains. This repository holds the releases and, under `src/`, a copy of the source each release was built from. The released `main.js` is not minified, and each release's files carry a GitHub attestation that they were built here: `gh attestation verify main.js --repo rizom-ai/obsidian-rizom-brain`.

Licensed under the AGPL, version 3. See `LICENSE`.
