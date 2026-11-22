import {
  DriveAuthError,
  DriveMissingError,
  DriveOfflineError,
  type DriveClient,
  type PutOptions,
} from "./drive-client";
import { getErrorMessage } from "@brains/utils/error";
import { bytesOf, sameBytes, sha256Hex, textOf } from "./hash";
import { imagesDown, imagesUp } from "./images";
import {
  IMAGE_FOLDER,
  conflictCopyPath,
  extensionOf,
  isSyncedType,
  placementOf,
} from "./paths";
import type { StateStore, SyncState } from "./state";
import type { SyncVault } from "./vault";

/** How many deletions one sync makes before it asks first. */
export const DELETE_LIMIT = 5;

export type SyncStatus =
  | "synced"
  /** The vault was never synced: a plan waits for the person's yes. */
  | "first-sync"
  | "offline"
  | "signed-out"
  | "no-drive";

export interface FileNote {
  path: string;
  reason: string;
}

export type Notice =
  /** A version lost; its text is in the Conflicts folder, and in the brain's Inbox when kept there. */
  | { kind: "conflict"; path: string; copy: string; inInbox: boolean }
  /** A rename the brain refused was undone in the vault. */
  | { kind: "rename-undone"; from: string; to: string; reason: string };

/** Deletions the sync did not make on its own, for the person to decide. */
export interface DeleteDecision {
  /** Files missing from the vault without the plugin seeing them deleted, or too many at once. */
  localMissing: string[];
  /** Entries gone from the brain, when there are too many at once. */
  remoteGone: string[];
}

/** What the first sync of a vault will do, before anything is written. */
export interface FirstSyncPlan {
  download: string[];
  upload: string[];
  /** In both, with the same text: recorded as in step. */
  agreed: string[];
  /** In both, with different text: the vault's file goes to Conflicts first. */
  replace: string[];
  localOnly: FileNote[];
}

export interface SyncReport {
  status: SyncStatus;
  firstSync?: FirstSyncPlan;
  downloaded: string[];
  uploaded: string[];
  deletedInBrain: string[];
  trashed: string[];
  notices: Notice[];
  /** Files the brain refused, with its reason; they stay as they are. */
  issues: FileNote[];
  /** Files the brain has no place for. */
  localOnly: FileNote[];
  decision?: DeleteDecision;
}

function newReport(status: SyncStatus = "synced"): SyncReport {
  return {
    status,
    downloaded: [],
    uploaded: [],
    deletedInBrain: [],
    trashed: [],
    notices: [],
    issues: [],
    localOnly: [],
  };
}

interface Remote {
  /** Every synced file the brain lists, with its version. */
  files: Map<string, string>;
  typeFolders: string[];
}

interface LocalFile {
  flavor: "text" | "image";
  hash: string;
  size: number;
  mtime: number;
  bytes(): Promise<Uint8Array>;
}

interface Context {
  state: SyncState;
  report: SyncReport;
  types: ReadonlySet<string>;
  /** The brain's image files by entity id, for links in notes. */
  imageFiles: Map<string, string>;
  /** The vault's files in `image/`. */
  vaultImages: Set<string>;
  remote?: Remote;
}

export interface SyncEngineOptions {
  vault: SyncVault;
  drive: DriveClient;
  store: StateStore;
  now?: () => Date;
}

/**
 * Keeps a vault and a brain in step. The brain's structure leads: notes are
 * the vault's top-level files, every other entry sits in its type's folder,
 * and anything else stays in the vault only. A version is told by the hash
 * of the vault's file and by the brain's ETag, never by size or time. An
 * edit made in both places is never lost.
 */
export class SyncEngine {
  private readonly vault: SyncVault;
  private readonly drive: DriveClient;
  private readonly store: StateStore;
  private readonly now: () => Date;
  /** Every operation runs after the one before: a sync never runs twice at once. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(options: SyncEngineOptions) {
    this.vault = options.vault;
    this.drive = options.drive;
    this.store = options.store;
    this.now = options.now ?? ((): Date => new Date());
  }

  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** A full sync: list the brain, compare every file, make each change. */
  sync(): Promise<SyncReport> {
    return this.exclusive(() =>
      this.guarded(async (context) => {
        const remote = await this.listRemote(context);
        if (!context.state.initialized) {
          context.report.status = "first-sync";
          context.report.firstSync = await this.planFirstSync(context, remote);
          return;
        }
        await this.replayRenames(context);
        const local = await this.scanLocal(context);
        await this.reconcile(context, remote, local);
      }),
    );
  }

  /** The first sync of a vault, after the person said yes to its plan. */
  applyFirstSync(): Promise<SyncReport> {
    return this.exclusive(() =>
      this.guarded(async (context) => {
        const remote = await this.listRemote(context);
        const plan = await this.planFirstSync(context, remote);
        const local = await this.scanLocal(context);
        for (const path of plan.agreed) {
          const file = local.get(path);
          const etag = remote.files.get(path);
          if (file && etag) await this.record(context, path, etag, file);
        }
        for (const path of plan.replace) {
          // The vault's version goes aside; the brain's takes its place.
          await this.vault.rename(path, conflictCopyPath(path, this.now()));
          await this.download(context, path, undefined);
        }
        for (const path of plan.download) {
          await this.download(context, path, undefined);
        }
        for (const path of plan.upload) {
          const file = local.get(path);
          if (file) await this.upload(context, path, file, { ifAbsent: true });
        }
        context.state.initialized = true;
        context.report.status = "synced";
      }),
    );
  }

  /** Upload one file the person saved, without listing the brain. */
  syncFile(path: string): Promise<SyncReport> {
    return this.exclusive(() =>
      this.guarded(async (context) => {
        if (!context.state.initialized) return;
        await this.replayRenames(context);
        const placement = placementOf(path, context.types);
        if (placement.kind !== "synced" || this.vault.isBusy(path)) return;
        const stat = await this.vault.stat(path);
        if (!stat) return;
        const bytes = await this.vault.read(path);
        const file = this.localFile(placement.flavor, stat, bytes);
        const hash = await sha256Hex(bytes);
        const known = context.state.paths[path];
        if (known?.hash === hash) return;
        context.vaultImages = new Set(
          (await this.vault.listFiles()).filter((name) =>
            name.startsWith(`${IMAGE_FOLDER}/`),
          ),
        );
        await this.upload(
          context,
          path,
          { ...file, hash },
          known ? { ifMatch: known.etag } : { ifAbsent: true },
        );
      }),
    );
  }

  /** The person deleted a file in the vault: its entry goes at the next sync. */
  noteDeleted(path: string): Promise<void> {
    return this.exclusive(async () => {
      const state = await this.store.load();
      if (!state.paths[path] || state.deletes.includes(path)) return;
      state.deletes.push(path);
      await this.store.save(state);
    });
  }

  /** The person renamed a file in the vault: the brain follows at the next sync. */
  noteRenamed(from: string, to: string): Promise<void> {
    return this.exclusive(async () => {
      const state = await this.store.load();
      const pending = state.renames.some((rename) => rename.to === from);
      if (!state.paths[from] && !pending) return;
      state.renames.push({ from, to });
      await this.store.save(state);
    });
  }

  /** The person's answer to deletions a sync did not make on its own. */
  resolveDeletes(answer: {
    localMissing?: { paths: string[]; action: "delete" | "restore" };
    remoteGone?: { paths: string[]; action: "trash" | "keep" };
  }): Promise<SyncReport> {
    return this.exclusive(() =>
      this.guarded(async (context) => {
        const missing = answer.localMissing;
        for (const path of missing?.paths ?? []) {
          if (missing?.action === "delete") {
            await this.deleteInBrain(context, path);
          } else {
            await this.download(context, path, undefined);
          }
        }
        const gone = answer.remoteGone;
        for (const path of gone?.paths ?? []) {
          if (gone?.action === "trash") {
            await this.vault.trash(path);
            delete context.state.paths[path];
            context.report.trashed.push(path);
          } else {
            // Kept: the file is the vault's again, and goes back to the brain.
            delete context.state.paths[path];
            const placement = placementOf(path, context.types);
            const stat = await this.vault.stat(path);
            if (placement.kind === "synced" && stat) {
              const bytes = await this.vault.read(path);
              await this.upload(
                context,
                path,
                {
                  ...this.localFile(placement.flavor, stat, bytes),
                  hash: await sha256Hex(bytes),
                },
                { ifAbsent: true },
              );
            }
          }
        }
      }),
    );
  }

  /**
   * Run with the stored state, save it whatever happens, and turn the drive's
   * failures into a status: nothing more is changed once one is met.
   */
  private async guarded(
    work: (context: Context) => Promise<void>,
  ): Promise<SyncReport> {
    const state = await this.store.load();
    const context: Context = {
      state,
      report: newReport(),
      types: new Set(state.typeFolders),
      imageFiles: imageFilesOf(Object.keys(state.paths)),
      vaultImages: new Set(),
    };
    try {
      await work(context);
    } catch (error) {
      if (error instanceof DriveOfflineError) {
        context.report.status = "offline";
      } else if (error instanceof DriveAuthError) {
        context.report.status = "signed-out";
      } else if (error instanceof DriveMissingError) {
        context.report.status = "no-drive";
      } else {
        throw error;
      }
    } finally {
      state.deletes = state.deletes.filter((path) => state.paths[path]);
      await this.store.save(state);
    }
    return context.report;
  }

  /** Every synced file the brain lists, folder by folder. */
  private async listRemote(context: Context): Promise<Remote> {
    const root = await this.drive.list("");
    const typeFolders = root
      .filter((entry) => entry.folder && !entry.path.startsWith("."))
      .map((entry) => entry.path);
    const types = new Set(typeFolders);
    const files = new Map<string, string>();
    const take = (path: string, etag: string | undefined): void => {
      if (etag !== undefined && placementOf(path, types).kind === "synced") {
        files.set(path, etag);
      }
    };
    root
      .filter((entry) => !entry.folder)
      .forEach((entry) => take(entry.path, entry.etag));
    const walk = async (folder: string): Promise<void> => {
      for (const entry of await this.drive.list(folder)) {
        const name = entry.path.slice(entry.path.lastIndexOf("/") + 1);
        if (name.startsWith(".")) continue;
        if (entry.folder) await walk(entry.path);
        else take(entry.path, entry.etag);
      }
    };
    for (const type of typeFolders.filter(isSyncedType)) await walk(type);

    context.state.typeFolders = typeFolders;
    context.types = types;
    context.remote = { files, typeFolders };
    context.imageFiles = imageFilesOf([...files.keys()]);
    return context.remote;
  }

  private localFile(
    flavor: "text" | "image",
    stat: { size: number; mtime: number },
    bytes: Uint8Array,
  ): Omit<LocalFile, "hash"> {
    return {
      flavor,
      size: stat.size,
      mtime: stat.mtime,
      bytes: async (): Promise<Uint8Array> => bytes,
    };
  }

  /** The vault's synced files with their hashes, and the ones the brain has no place for. */
  private async scanLocal(context: Context): Promise<Map<string, LocalFile>> {
    const local = new Map<string, LocalFile>();
    for (const path of await this.vault.listFiles()) {
      const placement = placementOf(path, context.types);
      if (placement.kind === "ignored") continue;
      if (placement.kind === "local") {
        context.report.localOnly.push({ path, reason: placement.reason });
        continue;
      }
      if (placement.flavor === "image") context.vaultImages.add(path);
      const stat = await this.vault.stat(path);
      if (!stat) continue;
      const known = context.state.paths[path];
      // A file whose size and time are as recorded is the file recorded.
      if (known?.size === stat.size && known.mtime === stat.mtime) {
        local.set(path, {
          flavor: placement.flavor,
          hash: known.hash,
          size: stat.size,
          mtime: stat.mtime,
          bytes: (): Promise<Uint8Array> => this.vault.read(path),
        });
        continue;
      }
      const bytes = await this.vault.read(path);
      local.set(path, {
        ...this.localFile(placement.flavor, stat, bytes),
        hash: await sha256Hex(bytes),
      });
    }
    return local;
  }

  private async planFirstSync(
    context: Context,
    remote: Remote,
  ): Promise<FirstSyncPlan> {
    const local = await this.scanLocal(context);
    const plan: FirstSyncPlan = {
      download: [],
      upload: [],
      agreed: [],
      replace: [],
      localOnly: context.report.localOnly,
    };
    for (const path of remote.files.keys()) {
      const file = local.get(path);
      if (!file) {
        plan.download.push(path);
        continue;
      }
      const stored = await this.drive.get(path);
      const same =
        stored !== undefined &&
        (await this.sameAsVault(context, file, stored.bytes));
      (same ? plan.agreed : plan.replace).push(path);
    }
    for (const path of local.keys()) {
      if (!remote.files.has(path)) plan.upload.push(path);
    }
    return plan;
  }

  /** Whether the brain's bytes are the vault's file, as the vault shows notes. */
  private async sameAsVault(
    context: Context,
    file: LocalFile,
    stored: Uint8Array,
  ): Promise<boolean> {
    const local = await file.bytes();
    if (sameBytes(local, stored)) return true;
    if (file.flavor !== "text") return false;
    return textOf(local) === imagesDown(textOf(stored), context.imageFiles);
  }

  /** Compare every path known to either side, and make each change. */
  private async reconcile(
    context: Context,
    remote: Remote,
    local: Map<string, LocalFile>,
  ): Promise<void> {
    const { state } = context;
    const paths = [
      ...new Set([
        ...Object.keys(state.paths),
        ...remote.files.keys(),
        ...local.keys(),
      ]),
    ].sort(
      // Images first: a note that embeds a new image needs it in the brain.
      (left, right) =>
        Number(!left.startsWith(`${IMAGE_FOLDER}/`)) -
          Number(!right.startsWith(`${IMAGE_FOLDER}/`)) ||
        left.localeCompare(right),
    );
    const localMissing: string[] = [];
    const seenDeletes: string[] = [];
    const remoteGone: string[] = [];

    for (const path of paths) {
      const known = state.paths[path];
      const etag = remote.files.get(path);
      const file = local.get(path);
      // A file being typed in is never written into: unless it has an edit
      // to send, it is left for the next sync. Sending one only writes back
      // over the text it sent.
      const editedHere = file !== undefined && file.hash !== known?.hash;
      if (this.vault.isBusy(path) && !editedHere) continue;
      try {
        if (!known) {
          if (file && etag !== undefined) {
            await this.meetNew(context, path, file, etag);
          } else if (file) {
            await this.upload(context, path, file, { ifAbsent: true });
          } else if (etag !== undefined) {
            await this.download(context, path, undefined);
          }
          continue;
        }
        const localChanged = file !== undefined && file.hash !== known.hash;
        const remoteChanged = etag !== undefined && etag !== known.etag;
        if (file && etag !== undefined) {
          if (localChanged) {
            // Over the version it was edited from; when that moved on, the
            // brain keeps this one as a conflict.
            await this.upload(context, path, file, { ifMatch: known.etag });
          } else if (remoteChanged) {
            await this.download(context, path, file);
          }
        } else if (file) {
          if (localChanged) {
            // Deleted in the brain, edited here: the edit survives as a new entry.
            await this.upload(context, path, file, { ifAbsent: true });
          } else {
            remoteGone.push(path);
          }
        } else if (etag !== undefined) {
          if (remoteChanged) {
            await this.download(context, path, undefined);
          } else if (state.deletes.includes(path)) {
            seenDeletes.push(path);
          } else {
            localMissing.push(path);
          }
        } else {
          delete state.paths[path];
        }
      } catch (error) {
        if (
          error instanceof DriveOfflineError ||
          error instanceof DriveAuthError
        ) {
          throw error;
        }
        context.report.issues.push({
          path,
          reason: getErrorMessage(error),
        });
      }
    }

    const decision: DeleteDecision = { localMissing, remoteGone: [] };
    if (seenDeletes.length > DELETE_LIMIT) {
      decision.localMissing.push(...seenDeletes);
    } else {
      for (const path of seenDeletes) await this.deleteInBrain(context, path);
    }
    if (remoteGone.length > DELETE_LIMIT) {
      decision.remoteGone = remoteGone;
    } else {
      for (const path of remoteGone) {
        await this.vault.trash(path);
        delete state.paths[path];
        context.report.trashed.push(path);
      }
    }
    if (decision.localMissing.length > 0 || decision.remoteGone.length > 0) {
      context.report.decision = decision;
    }
  }

  /** A file in both places that was never synced: the same, or a collision. */
  private async meetNew(
    context: Context,
    path: string,
    file: LocalFile,
    etag: string,
  ): Promise<void> {
    const stored = await this.drive.get(path);
    if (stored && (await this.sameAsVault(context, file, stored.bytes))) {
      await this.record(context, path, stored.etag ?? etag, file);
      return;
    }
    // Two files made apart under one name: the brain's stays, this one is
    // kept as a conflict.
    await this.upload(context, path, file, { ifAbsent: true });
  }

  private async record(
    context: Context,
    path: string,
    etag: string,
    file: { hash: string; size: number; mtime: number },
  ): Promise<void> {
    context.state.paths[path] = {
      etag,
      hash: file.hash,
      size: file.size,
      mtime: file.mtime,
    };
    await this.store.save(context.state);
  }

  /** Write the brain's version into the vault; a note the person changed meanwhile is left. */
  private async download(
    context: Context,
    path: string,
    current: LocalFile | undefined,
  ): Promise<boolean> {
    const stored = await this.drive.get(path);
    if (!stored) {
      delete context.state.paths[path];
      return false;
    }
    const etag = stored.etag ?? context.remote?.files.get(path);
    if (etag === undefined) return false;
    const flavor = extensionOf(path) === ".md" ? "text" : "binary";
    const bytes =
      flavor === "text"
        ? bytesOf(imagesDown(textOf(stored.bytes), context.imageFiles))
        : stored.bytes;
    if (current && flavor === "text") {
      const written = await this.vault.replaceText(
        path,
        textOf(await current.bytes()),
        textOf(bytes),
      );
      if (!written) return false;
    } else {
      await this.vault.write(path, bytes);
    }
    const stat = await this.vault.stat(path);
    await this.record(context, path, etag, {
      hash: await sha256Hex(bytes),
      size: stat?.size ?? bytes.byteLength,
      mtime: stat?.mtime ?? 0,
    });
    context.report.downloaded.push(path);
    return true;
  }

  /** Make sure the brain holds an image a note embeds, before the note goes up. */
  private async ensureImage(context: Context, path: string): Promise<void> {
    if (context.state.paths[path] || context.remote?.files.has(path)) return;
    const stat = await this.vault.stat(path);
    if (!stat) return;
    const bytes = await this.vault.read(path);
    const result = await this.drive.put(path, bytes, { ifAbsent: true });
    if ((result.status === 201 || result.status === 204) && result.etag) {
      await this.record(context, path, result.etag, {
        hash: await sha256Hex(bytes),
        size: stat.size,
        mtime: stat.mtime,
      });
      context.imageFiles.set(stemOf(path), path);
      context.report.uploaded.push(path);
    }
  }

  /** Send a file to the brain, and settle the vault with what the brain kept. */
  private async upload(
    context: Context,
    path: string,
    file: LocalFile,
    mode: Pick<PutOptions, "ifMatch" | "ifAbsent">,
  ): Promise<void> {
    const local = await file.bytes();
    let send = local;
    if (file.flavor === "text") {
      const up = imagesUp(textOf(local), context.vaultImages);
      for (const image of up.images) await this.ensureImage(context, image);
      if (up.outside.length > 0) {
        context.report.issues.push({
          path,
          reason: `The brain cannot show images from outside image/: ${up.outside.join(", ")}`,
        });
      }
      send = bytesOf(up.text);
    }
    const result = await this.drive.put(path, send, {
      ...mode,
      keepAsConflict: true,
    });
    if (result.status === 201 || result.status === 204) {
      if (result.stored === "conflict" || result.conflictId !== undefined) {
        await this.giveWay(context, path, local, true);
        return;
      }
      const etag = result.etag;
      if (etag === undefined) return;
      let kept = local;
      if (file.flavor === "text" && result.stored === "other-form") {
        // The brain stores it in its own form: the vault shows that form,
        // unless the person changed the file meanwhile.
        const stored = await this.drive.get(path);
        if (stored) {
          const shown = imagesDown(textOf(stored.bytes), context.imageFiles);
          if (await this.vault.replaceText(path, textOf(local), shown)) {
            kept = bytesOf(shown);
          }
        }
      }
      const stat = await this.vault.stat(path);
      await this.record(context, path, etag, {
        hash: await sha256Hex(kept),
        size: stat?.size ?? kept.byteLength,
        mtime: stat?.mtime ?? 0,
      });
      context.report.uploaded.push(path);
      return;
    }
    if (result.status === 412) {
      // Lost, and nothing in the brain keeps it: the vault keeps the copy.
      await this.giveWay(context, path, local, false);
      return;
    }
    const reason =
      result.message || `The brain refused the file (${result.status}).`;
    if (mode.ifAbsent && !context.state.paths[path]) {
      context.report.localOnly.push({ path, reason });
    } else {
      context.report.issues.push({ path, reason });
    }
  }

  /** A version lost: copy it to Conflicts, and take the brain's in its place. */
  private async giveWay(
    context: Context,
    path: string,
    local: Uint8Array,
    inInbox: boolean,
  ): Promise<void> {
    const copy = conflictCopyPath(path, this.now());
    await this.vault.write(copy, local);
    const current: LocalFile = {
      flavor: extensionOf(path) === ".md" ? "text" : "image",
      hash: await sha256Hex(local),
      size: local.byteLength,
      mtime: 0,
      bytes: async (): Promise<Uint8Array> => local,
    };
    await this.download(context, path, current);
    context.report.notices.push({ kind: "conflict", path, copy, inInbox });
  }

  /** Delete an entry the person deleted, only as the version they last saw. */
  private async deleteInBrain(context: Context, path: string): Promise<void> {
    const known = context.state.paths[path];
    if (!known) return;
    const status = await this.drive.delete(path, known.etag);
    if (status === 204 || status === 200 || status === 404) {
      delete context.state.paths[path];
      await this.store.save(context.state);
      context.report.deletedInBrain.push(path);
      return;
    }
    // Changed since, or refused: the entry comes back into the vault.
    if (status !== 412) {
      context.report.issues.push({
        path,
        reason: `The brain kept this entry (${status}); it is back in the vault.`,
      });
    }
    await this.download(context, path, undefined);
  }

  /** Make the vault's renames in the brain, in order; undo the ones it refuses. */
  private async replayRenames(context: Context): Promise<void> {
    const { state } = context;
    for (const rename of [...state.renames]) {
      const known = state.paths[rename.from];
      if (known) {
        const from = placementOf(rename.from, context.types);
        const to = placementOf(rename.to, context.types);
        if (
          to.kind !== "synced" ||
          from.kind !== "synced" ||
          to.flavor !== from.flavor
        ) {
          await this.undoRename(
            context,
            rename,
            to.kind === "local"
              ? to.reason
              : "The brain has no place for the file there.",
          );
        } else {
          const result = await this.drive.move(rename.from, rename.to);
          if (result.status === 201 || result.status === 204) {
            state.paths[rename.to] = known;
            delete state.paths[rename.from];
            const etag = context.remote?.files.get(rename.from);
            if (context.remote && etag !== undefined) {
              context.remote.files.delete(rename.from);
              context.remote.files.set(rename.to, etag);
            }
          } else if (result.status === 404) {
            delete state.paths[rename.from];
          } else {
            await this.undoRename(
              context,
              rename,
              result.message ||
                `The brain refused the rename (${result.status}).`,
            );
          }
        }
      }
      state.renames.shift();
      await this.store.save(state);
    }
  }

  private async undoRename(
    context: Context,
    rename: { from: string; to: string },
    reason: string,
  ): Promise<void> {
    if (
      (await this.vault.exists(rename.to)) &&
      !(await this.vault.exists(rename.from))
    ) {
      await this.vault.rename(rename.to, rename.from);
    }
    context.report.notices.push({
      kind: "rename-undone",
      from: rename.from,
      to: rename.to,
      reason,
    });
  }
}

function stemOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name.slice(0, name.length - extensionOf(name).length);
}

/** The image files among paths, by entity id: an image's file is `image/<id>.<ext>`. */
function imageFilesOf(paths: readonly string[]): Map<string, string> {
  return new Map(
    paths
      .filter(
        (path) =>
          path.startsWith(`${IMAGE_FOLDER}/`) &&
          !path.slice(IMAGE_FOLDER.length + 1).includes("/"),
      )
      .map((path) => [stemOf(path), path]),
  );
}
