# Plan: Rizom Brain for Neovim

## Status

Proposed. Phase 1 in progress.

## Background

The Rizom Brain plugin for Obsidian keeps a vault on disk in step with a brain through the drive (`plugins/webdav`). Its sync engine, in `packages/obsidian-plugin/src/engine/`, has no Obsidian imports: it takes a vault (`SyncVault`), a drive client and a state store. Two things in it are still Obsidian's: it writes the `_obsidian/` templates, fileClasses and bases, and it points Obsidian's Templates setting at them.

People who write in Neovim have no way to work on their brain's notes as files, other than mounting the drive, which does not work offline and has no conflict handling.

## Goal

A folder on disk that stays in step with the brain, the way an Obsidian vault does, edited in Neovim.

1. The person runs `brain sync ~/brain` once with the brain's address and an app password. The first sync lists what it will download, upload and replace, and starts on a yes.
2. From then on `brain sync` keeps the folder in step: changes made in the brain arrive through the drive's change feed, files saved in the folder go up.
3. In Neovim, the Rizom Brain plugin starts `brain sync` for the folder, shows its state in the statusline, syncs a file on `:w`, reloads buffers the brain changed, and opens a conflict as a side-by-side diff.

`brain sync` works without Neovim too: with Helix, Emacs or no editor at all.

## Non-goals

- No second sync engine. Neovim and `brain sync` use the Obsidian plugin's engine, moved into a shared package.
- No `_obsidian/` files outside Obsidian.
- No sync of files outside the brain's structure. As in Obsidian, notes sit at the root, every other type in its own folder, and anything else stays local.
- No Lua sync logic. The Neovim plugin talks to `brain sync`; it does not reach the drive itself.
- None of [obsidian-brain-features.md](./obsidian-brain-features.md) for Neovim in this plan. Its drive calls (related notes, capture, publish, Ask) go into the shared drive client once phase 1 lands, so a later Neovim plan can use them.

## Design

### Packages

```
shared/vault-sync           @brains/vault-sync: engine, drive client, change feed,
                            state, placement, images, MemoryVault
  ├─ packages/obsidian-plugin   Obsidian vault, settings, dialogs; adds _obsidian/ files
  └─ packages/brain-cli         `brain sync <folder>`: a vault on disk, a folder watcher
        └─ packages/neovim-plugin   Lua; runs `brain sync --json` as a job
```

### Generated files

The engine takes an optional `generated` hook: a folder that is never synced, the files to write there for the brain's types (each kept as the brain writes it or the person's once changed), and a step that runs after they are written, told whether it was the first time. The Obsidian plugin passes the `_obsidian/` files and, on the first write, points Templates at `_obsidian/templates` when no folder is chosen. `SyncVault` loses its template-folder methods. The stored state keeps `generated`; `templateFolderSet` goes, because "first time" is told by `generated` being empty. A vault that already has the files never sees a first time again, so nothing changes for people using the plugin now.

### `brain sync`

```
brain sync <folder> [--address <url>] [--once] [--yes] [--json]
```

- State lives in `<folder>/.rizom-brain/state.json`. A dot-folder is never synced.
- The app password is kept in `~/.config/rizom-brain/credentials.json` (mode 0600), by brain address. `BRAIN_SYNC_USERNAME` and `BRAIN_SYNC_PASSWORD` take precedence.
- Without `--once` it keeps running: the change feed (`ChangeWatcher`, `ChangeFollower`), a full compare every 30 minutes, and a folder watcher that sends saves, deletes and renames to the engine.
- A file is busy for two seconds after it was written to, as in Obsidian. Under `--json` the editor also names the files it holds unsaved changes for.
- Questions (first sync, more than five deletions, conflicts) are asked on the terminal, or sent as JSON messages under `--json` and answered the same way.

#### Flow

```
start
  ├─ no credentials ──────────────► exit 2, says how to connect
  ├─ brain older than 0.2.0-alpha.769 ─► exit 2, names the version
  ├─ first sync ─► plan ─► yes ──► apply ─► follow
  │                  └─ no ──────► exit 0, nothing changed
  └─ follow
       ├─ change feed: types changed ─► partial sync
       ├─ watcher: file saved ─────────► sync that file
       ├─ watcher: file gone ──────────► delete in the brain
       ├─ watcher: gone + same content appears ─► rename in the brain
       ├─ brain unreachable ───────────► retry; full compare every 5 min
       ├─ app password refused ────────► stop following, say so, exit 2
       └─ SIGINT/SIGTERM ──────────────► finish the running sync, exit 0
```

### Renames

Obsidian reports a rename; a folder watcher sees a file go and another appear. A file that appears within two seconds of one going, with the hash the engine last recorded for the one that went, is a rename. Otherwise it is a delete and a new file. A rename of a file that was also changed is a delete and a new file: the brain loses the note's history for it, nothing else.

### Neovim plugin

- `packages/neovim-plugin`, Lua, with `lua/rizom-brain/` and `plugin/rizom-brain.lua`. Neovim 0.10 or later (`vim.system`, `vim.uv`).
- `require("rizom-brain").setup({ folder = "~/brain" })`. It starts `brain sync <folder> --json` when a buffer in the folder opens, and stops it when Neovim quits.
- Messages are JSON lines on the job's stdin and stdout: `status`, `report`, `ask`, `answer`, `busy`, `changed`, `conflicts`, `settle`.
- `:Brain status`, `:Brain sync`, `:Brain conflicts`, `:Brain connect`. A statusline function `require("rizom-brain").status()`.
- `:w` on a file in the folder sends it to sync. A file the brain changed is reloaded with `:checktime` when its buffer has no unsaved changes; with unsaved changes it is reported busy and left alone.
- A conflict opens as `:diffsplit` of the brain's version and the folder's copy; `:Brain keep brain|mine` settles it.
- Tests run in `nvim --headless -l` against a stand-in `brain sync` that replays messages. CI installs Neovim.

### Connect

Studio's Connect card hands the app password back through an `obsidian://` link. For `brain sync`, Studio redirects to a local address instead: `brain sync connect <address>` listens on `127.0.0.1` on a free port, opens the brain on the Drive section of the account, as Obsidian's Connect does, with `connect=cli` and `callback=http://127.0.0.1:<port>/` in place of `connect=obsidian`, and takes the password from the redirect when the state matches. Studio accepts only a `127.0.0.1` or `localhost` callback. Until this phase ships, the person creates the app password in Studio's Drive section and enters it.

## Phases

Each phase is one PR.

1. **Extract the engine.** `shared/vault-sync` holds the engine and its tests. The `_obsidian/` files become the `generated` hook; `SyncVault` loses its template-folder methods. The Obsidian plugin behaves as before and its build still bundles the engine.
2. **`brain sync --once`.** A vault on disk, credentials from the environment or the credentials file, the first-sync plan on the terminal with `--yes` to apply, one full sync, then exit with a status. Tests run the engine against a temporary folder and an in-process drive.
3. **`brain sync` keeps running.** Change feed, folder watcher for saves and deletes, 30-minute full compare, clean stop on a signal.
4. **Renames from the watcher.** Gone-and-appeared with the same hash becomes `noteRenamed`.
5. **`--json` and the Neovim walking skeleton.** The message protocol; the plugin starts the job, shows the status, sends saves, reloads changed buffers, and asks the first-sync question with `vim.ui.select`.
6. **Deletes asked in Neovim.** More than five deletions, or files gone while nothing was running, are asked with `vim.ui.select`.
7. **Conflicts in Neovim.** `:Brain conflicts`, the diff split, settling a conflict (the drive's `DELETE /dav/.brain/conflicts/<id>`).
8. **Connect.** `brain sync connect` and Studio's local callback; `:Brain connect`. Needs a brain release before a deployed brain has it.
9. **Publishing.** A public repository for the Neovim plugin, installable with lazy.nvim, and the docs page `docs/drive-and-obsidian.md` gaining `brain sync` and Neovim. Creating the repository and the first release need the owner's yes.

## Open questions

- The plugin's public repository name. `rizom-ai/rizom-brain.nvim` follows Neovim's convention.
- Whether `brain sync` should ship in `@rizom/brain` or in a smaller package of its own. `@rizom/brain` is a 7 MB Bun bundle with the whole runtime; a person who only syncs needs a fraction of it. It starts in `@rizom/brain`; a package of its own is a later step if the install size bothers people.
