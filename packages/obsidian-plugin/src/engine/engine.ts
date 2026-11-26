import {
  DriveAuthError,
  DriveMissingError,
  DriveOfflineError,
  DriveUnavailableError,
  type DriveClient,
  type PutOptions,
} from "./drive-client";
import { getErrorMessage } from "@brains/utils/error";
import { bytesOf, sameBytes, sha256Hex, textOf } from "./hash";
import { imagesDown, imagesUp } from "./images";
import { TEMPLATES_FOLDER, vaultFiles } from "../vault-files/vault-files";
import {
  IMAGE_FOLDER,
  OBSIDIAN_FILES_FOLDER,
  conflictCopyPath,
  extensionOf,
  isSyncedType,
  placementOf,
} from "./paths";
import type { StateStore, SyncState } from "./state";
import type { SyncVault } from "./vault";

/** The type of the files at the vault's root. */
const NOTE_TYPE = "note";

/** How many files are fetched at once: a far brain answers each one slowly. */
export const DOWNLOADS_AT_ONCE = 6;

/** How many deletions one sync makes before it asks first. */
export const DELETE_LIMIT = 5;

export type SyncStatus =
  | "synced"
  /** The vault was never synced: a plan waits for the person's yes. */
  | "first-sync"
  | "offline"
  /** The brain is there but not answering for now, as during a deploy. */
  | "unavailable"
  | "signed-out"
  | "no-drive"
  /** The brain is from before the sync endpoints: it is not synced with. */
  | "old-brain";

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
  /** The types a partial sync compared; absent when everything was. */
  scope?: string[];
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
  private syncSupported = false;

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

  /** Whether the brain has the sync endpoints; asked until it has, then known. */
  private async supported(): Promise<boolean> {
    this.syncSupported ||= await this.drive.supportsSync();
    return this.syncSupported;
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
        await this.writeVaultFiles(context);
        await this.replayRenames(context);
        const local = await this.scanLocal(context);
        await this.reconcile(context, remote, local);
      }),
    );
  }

  /**
   * A sync of only the types the brain said changed ("note" is the vault's
   * root): their folders are listed and compared, and every other file is
   * left exactly as it is.
   */
  syncTypes(types: readonly string[]): Promise<SyncReport> {
    return this.exclusive(() =>
      this.guarded(async (context) => {
        if (!context.state.initialized) {
          context.report.status = "first-sync";
          return;
        }
        // Only types the vault holds: the brain's own, like its conflict
        // records, change without anything here to fetch.
        const held = new Set([NOTE_TYPE, ...context.state.typeFolders]);
        const wanted = new Set(
          types.filter((type) => held.has(type) && isSyncedType(type)),
        );
        context.report.scope = [...wanted];
        if (wanted.size === 0) return;
        const inScope = (path: string): boolean => {
          const slash = path.indexOf("/");
          return wanted.has(slash < 0 ? NOTE_TYPE : path.slice(0, slash));
        };
        const remote = await this.listRemote(context, wanted);
        await this.replayRenames(context);
        const local = await this.scanLocal(context);
        await this.reconcile(context, remote, local, inScope);
      }),
    );
  }

  /** The first sync of a vault, after the person said yes to its plan. */
  applyFirstSync(): Promise<SyncReport> {
    return this.exclusive(() =>
      this.guarded(async (context) => {
        const remote = await this.listRemote(context);
        // Said yes again: the first sync was made, and this is a sync.
        if (context.state.initialized) {
          await this.replayRenames(context);
          await this.reconcile(context, remote, await this.scanLocal(context));
          return;
        }
        const plan = await this.planFirstSync(context, remote);
        const local = await this.scanLocal(context);
        for (const path of plan.agreed) {
          const file = local.get(path);
          const etag = remote.files.get(path);
          if (file && etag) await this.record(context, path, etag, file);
        }
        for (const path of plan.replace) {
          // The vault's version is copied aside, never moved: a move would
          // point other notes' links at the copy. The brain's takes its place.
          const file = local.get(path);
          if (!file) continue;
          const bytes = await file.bytes();
          await this.vault.write(conflictCopyPath(path, this.now()), bytes);
          await this.download(context, path, file);
        }
        await this.together(plan.download, (path) =>
          this.download(context, path, undefined),
        );
        for (const path of plan.upload) {
          const file = local.get(path);
          if (file) await this.upload(context, path, file, { ifAbsent: true });
        }
        context.state.initialized = true;
        await this.writeVaultFiles(context);
        context.report.status = "synced";
      }),
    );
  }

  /** Upload one file the person saved, without listing the brain. */
  syncFile(path: string): Promise<SyncReport> {
    return this.exclusive(() =>
      this.guarded(async (context) => {
        if (!context.state.initialized) {
          context.report.status = "first-sync";
          return;
        }
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
        await this.loadVaultImages(context);
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
        if (missing?.action === "restore") {
          await this.together(missing.paths, (path) =>
            this.download(context, path, undefined),
          );
        } else {
          for (const path of missing?.paths ?? []) {
            await this.deleteInBrain(context, path);
          }
        }
        const gone = answer.remoteGone;
        if (gone?.action === "keep") await this.loadVaultImages(context);
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
      // An older brain would hold saves back and refuse renames: nothing is
      // read, planned or written against one.
      if (await this.supported()) {
        await work(context);
      } else {
        context.report.status = "old-brain";
      }
    } catch (error) {
      if (error instanceof DriveOfflineError) {
        context.report.status = "offline";
      } else if (error instanceof DriveUnavailableError) {
        context.report.status = "unavailable";
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

  /**
   * The templates, fileClasses and bases for the brain's types. The brain's
   * templates and fileClasses are kept as it writes them; a base is written
   * only where missing, and is the person's from then on. A file being typed
   * in is left for the next sync. Obsidian's Templates is pointed at them
   * when the person has not chosen a folder.
   */
  private async writeVaultFiles(context: Context): Promise<void> {
    const { state } = context;
    try {
      const shapes = await this.drive.vaultShapes();
      if (shapes === undefined) return;
      const files = vaultFiles(
        shapes.filter((shape) => isSyncedType(shape.entityType)),
      );
      for (const file of files) {
        if (this.vault.isBusy(file.path)) continue;
        const bytes = bytesOf(file.content);
        const hash = await sha256Hex(bytes);
        if (await this.vault.exists(file.path)) {
          const current = await sha256Hex(await this.vault.read(file.path));
          if (current === hash) {
            state.generated[file.path] = hash;
            continue;
          }
          // A base is the person's once they change it. One still as the
          // plugin wrote it follows the brain, so it gains new types.
          if (
            file.owner === "person" &&
            state.generated[file.path] !== current
          ) {
            continue;
          }
        }
        await this.vault.write(file.path, bytes);
        state.generated[file.path] = hash;
      }
      await this.removeRetiredVaultFiles(
        state,
        new Set(files.map((file) => file.path)),
      );
      // Once: a person who clears the folder afterwards keeps it cleared.
      if (!state.templateFolderSet) {
        if ((await this.vault.getTemplateFolder()) === undefined) {
          await this.vault.setTemplateFolder(TEMPLATES_FOLDER);
        }
        state.templateFolderSet = true;
      }
    } catch (error) {
      if (
        error instanceof DriveOfflineError ||
        error instanceof DriveUnavailableError ||
        error instanceof DriveAuthError
      ) {
        throw error;
      }
      // Templates and tables are a convenience: notes sync without them.
      context.report.issues.push({
        path: OBSIDIAN_FILES_FOLDER,
        reason: `The brain's templates and tables could not be written: ${getErrorMessage(error)}`,
      });
    }
  }

  /**
   * Files the plugin wrote for a type the brain no longer has: its template
   * and fileClass go, and its base goes when the person never changed it.
   */
  private async removeRetiredVaultFiles(
    state: SyncState,
    wanted: ReadonlySet<string>,
  ): Promise<void> {
    const bases = `${OBSIDIAN_FILES_FOLDER}/bases/`;
    for (const [path, written] of Object.entries(state.generated)) {
      if (wanted.has(path)) continue;
      if (await this.vault.exists(path)) {
        const untouched =
          (await sha256Hex(await this.vault.read(path))) === written;
        if (!path.startsWith(bases) || untouched) await this.vault.trash(path);
      }
      delete state.generated[path];
    }
  }

  /** Every synced file the brain lists, folder by folder. */
  private async listRemote(
    context: Context,
    /** Only these types' folders, when given; every folder otherwise. */
    only?: ReadonlySet<string>,
  ): Promise<Remote> {
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
    if (only === undefined || only.has(NOTE_TYPE)) {
      root
        .filter((entry) => !entry.folder)
        .forEach((entry) => take(entry.path, entry.etag));
    }
    const walk = async (folder: string): Promise<void> => {
      for (const entry of await this.drive.list(folder)) {
        const name = entry.path.slice(entry.path.lastIndexOf("/") + 1);
        if (name.startsWith(".")) continue;
        if (entry.folder) await walk(entry.path);
        else take(entry.path, entry.etag);
      }
    };
    for (const type of typeFolders.filter(isSyncedType)) {
      if (only === undefined || only.has(type)) await walk(type);
    }

    context.state.typeFolders = typeFolders;
    context.types = types;
    context.remote = { files, typeFolders };
    // Images known from before count too: a partial listing has not seen them.
    context.imageFiles = imageFilesOf([
      ...Object.keys(context.state.paths),
      ...files.keys(),
    ]);
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
    /** Only these paths, when given: the rest was not listed. */
    inScope: (path: string) => boolean = (): boolean => true,
  ): Promise<void> {
    const { state } = context;
    const paths = [
      ...new Set([
        ...Object.keys(state.paths),
        ...remote.files.keys(),
        ...local.keys(),
      ]),
    ]
      .filter(inScope)
      .sort(
        // Images first: a note that embeds a new image needs it in the brain.
        (left, right) =>
          Number(!left.startsWith(`${IMAGE_FOLDER}/`)) -
            Number(!right.startsWith(`${IMAGE_FOLDER}/`)) ||
          left.localeCompare(right),
      );
    const localMissing: string[] = [];
    const seenDeletes: string[] = [];
    const remoteGone: string[] = [];
    // Files that only need fetching, gathered to be fetched several at once.
    const downloads: { path: string; file: LocalFile | undefined }[] = [];

    for (const path of paths) {
      const known = state.paths[path];
      const etag = remote.files.get(path);
      const file = local.get(path);
      // A file being typed in is never written into: unless it has an edit
      // to send, it is left for the next sync. Sending one only writes back
      // over the text it sent.
      const editedHere = file !== undefined && file.hash !== known?.hash;
      // A file that is there again was not deleted after all.
      if (file !== undefined && state.deletes.includes(path)) {
        state.deletes = state.deletes.filter((marked) => marked !== path);
      }
      if (this.vault.isBusy(path) && !editedHere) continue;
      try {
        if (!known) {
          if (file && etag !== undefined) {
            await this.meetNew(context, path, file, etag);
          } else if (file) {
            await this.upload(context, path, file, { ifAbsent: true });
          } else if (etag !== undefined) {
            downloads.push({ path, file: undefined });
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
            downloads.push({ path, file });
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
            downloads.push({ path, file: undefined });
          } else if (state.deletes.includes(path)) {
            seenDeletes.push(path);
          } else {
            localMissing.push(path);
          }
        } else {
          delete state.paths[path];
        }
      } catch (error) {
        this.fileFailed(context, path, error);
      }
    }

    await this.together(downloads, async ({ path, file }) => {
      try {
        await this.download(context, path, file);
      } catch (error) {
        this.fileFailed(context, path, error);
      }
    });

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

  /**
   * One file's failure is listed and the sync goes on, unless it is the
   * brain itself that is away or refusing: that ends the sync.
   */
  private fileFailed(context: Context, path: string, error: unknown): void {
    if (
      error instanceof DriveOfflineError ||
      error instanceof DriveUnavailableError ||
      error instanceof DriveAuthError
    ) {
      throw error;
    }
    context.report.issues.push({ path, reason: getErrorMessage(error) });
  }

  /**
   * Do the same work for many files, several at once. Every one of a group
   * finishes before a failure ends the rest, so nothing is still running
   * when the sync's state is saved.
   */
  private async together<T>(
    items: readonly T[],
    work: (item: T) => Promise<unknown>,
  ): Promise<void> {
    const groups = Array.from(
      { length: Math.ceil(items.length / DOWNLOADS_AT_ONCE) },
      (_, index) =>
        items.slice(index * DOWNLOADS_AT_ONCE, (index + 1) * DOWNLOADS_AT_ONCE),
    );
    for (const group of groups) {
      const results = await Promise.allSettled(group.map(work));
      const failed = results.find((result) => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
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
    await this.settle(context, path, etag, bytes);
    context.report.downloaded.push(path);
    return true;
  }

  /**
   * Record that the vault and the brain agree on `kept`. The file's size and
   * time are kept only while it still holds those bytes: a file changed
   * meanwhile, by a save during the upload, is hashed again by the next
   * sync, which then sees the change.
   */
  private async settle(
    context: Context,
    path: string,
    etag: string,
    kept: Uint8Array,
  ): Promise<void> {
    const hash = await sha256Hex(kept);
    const stat = await this.vault.stat(path);
    const unchanged =
      stat !== undefined &&
      (await sha256Hex(await this.vault.read(path))) === hash;
    context.state.paths[path] = unchanged
      ? { etag, hash, size: stat.size, mtime: stat.mtime }
      : { etag, hash };
    // The file is in both places: whatever delete was marked for it is over.
    context.state.deletes = context.state.deletes.filter(
      (marked) => marked !== path,
    );
    await this.store.save(context.state);
  }

  private async loadVaultImages(context: Context): Promise<void> {
    context.vaultImages = new Set(
      (await this.vault.listFiles()).filter((name) =>
        name.startsWith(`${IMAGE_FOLDER}/`),
      ),
    );
  }

  /**
   * Make sure the brain holds an image a note embeds, before the note goes
   * up. Why the brain did not take it, when it did not.
   */
  private async ensureImage(
    context: Context,
    path: string,
  ): Promise<string | undefined> {
    if (context.state.paths[path] || context.remote?.files.has(path)) {
      return undefined;
    }
    if (!(await this.vault.exists(path))) return "It is not in the vault.";
    const bytes = await this.vault.read(path);
    const result = await this.drive.put(path, bytes, { ifAbsent: true });
    if ((result.status === 201 || result.status === 204) && result.etag) {
      await this.settle(context, path, result.etag, bytes);
      context.imageFiles.set(stemOf(path), path);
      context.report.uploaded.push(path);
      return undefined;
    }
    return result.message || `The brain refused it (${result.status}).`;
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
      const first = imagesUp(textOf(local), context.vaultImages);
      const refused = new Map<string, string>();
      for (const image of first.images) {
        const reason = await this.ensureImage(context, image);
        if (reason !== undefined) refused.set(image, reason);
      }
      // An image the brain did not take keeps its embed: a reference to an
      // image the brain does not hold would show nothing anywhere.
      const held = new Set(
        [...context.vaultImages].filter((image) => !refused.has(image)),
      );
      const up = imagesUp(textOf(local), held);
      const refusedNames = new Set(
        [...refused.keys()].flatMap((image) => [
          image,
          image.slice(IMAGE_FOLDER.length + 1),
        ]),
      );
      const outside = up.outside.filter((name) => !refusedNames.has(name));
      for (const [image, reason] of refused) {
        context.report.issues.push({
          path,
          reason: `The brain did not take ${image}, so the note keeps its embed: ${reason}`,
        });
      }
      if (outside.length > 0) {
        context.report.issues.push({
          path,
          reason: `The brain cannot show images from outside image/: ${outside.join(", ")}`,
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
      await this.settle(context, path, etag, kept);
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
    const forget = (): void => {
      context.state.deletes = context.state.deletes.filter(
        (marked) => marked !== path,
      );
    };
    if (!known) {
      forget();
      return;
    }
    const status = await this.drive.delete(path, known.etag);
    if (status >= 500) {
      // Not a refusal: the delete is tried again at the next sync.
      context.report.issues.push({
        path,
        reason: `The brain could not delete this entry yet (${status}); it is tried again.`,
      });
      return;
    }
    forget();
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
          } else if (result.status >= 500) {
            // Not a refusal: the rename waits for the next sync, in order.
            context.report.issues.push({
              path: rename.to,
              reason: `The brain could not rename this yet (${result.status}); it is tried again.`,
            });
            return;
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
