import {
  DOCUMENT_EXTENSIONS,
  IMAGE_EXTENSIONS,
} from "@brains/entity-placement";
import { posix } from "path";
import {
  isKeptPath,
  KEPT_CAP_BYTES,
  memoryKeptStore,
  type KeptStore,
} from "./dav-kept";

const ENTITY_EXTENSIONS = new Set([
  ".md",
  ".yaml",
  ...IMAGE_EXTENSIONS,
  ...DOCUMENT_EXTENSIONS,
]);

export const SCRATCH_IDLE_MS: number = 10 * 60 * 1000;
export const SCRATCH_CAP_BYTES: number = 16 * 1024 * 1024;

export interface ScratchFile {
  /** Path below the drive's root, one name per segment. */
  segments: string[];
  bytes: Uint8Array<ArrayBuffer>;
  modified: Date;
}

interface StoredScratchFile extends ScratchFile {
  touched: number;
}

/** A kept path never goes idle; anything else does. */
const idle = (key: string, touched: number, now: number): boolean =>
  !isKeptPath(key.split("/")) && now - touched >= SCRATCH_IDLE_MS;

/**
 * Whether a name is an editor's own file rather than an entity's: a dot
 * file, or anything that does not end in an extension entities are stored
 * under. Swap files, backups (`note.md~`), atomic-save temporaries
 * (`note.md.tmp`, `.goutputstream-XXXX`), lock files and macOS `._` twins
 * all land here.
 */
export function isScratchName(name: string): boolean {
  return (
    name.startsWith(".") ||
    !ENTITY_EXTENSIONS.has(posix.extname(name).toLowerCase())
  );
}

/**
 * The files editors write around a save, kept per person in memory. They are
 * never entities: nobody else sees them, they are gone ten minutes after
 * their last use and on restart, and one person holds 16 MiB at most.
 */
export class ScratchStore {
  private readonly files = new Map<string, Map<string, StoredScratchFile>>();
  /** Folders a person made and has not saved into yet, by path, with their last use. */
  private readonly folders = new Map<string, Map<string, number>>();
  private readonly now: () => number;
  private readonly kept: KeptStore;
  /** The people whose kept folders are in memory. */
  private readonly opened = new Map<string, Promise<void>>();
  /** Writes to the kept store that have not finished yet, in order. */
  private pending: Promise<void> = Promise.resolve();

  constructor(
    now: () => number = Date.now,
    kept: KeptStore = memoryKeptStore(),
  ) {
    this.now = now;
    this.kept = kept;
  }

  /**
   * Bring a person's kept folders into memory, once. Every request of
   * theirs waits for it, so a kept file is there before it is asked for.
   */
  open(userId: string): Promise<void> {
    const opened =
      this.opened.get(userId) ??
      this.kept.load(userId).then((entries) => {
        entries.forEach(({ path, bytes, modified }) => {
          const segments = path.split("/");
          if (bytes === undefined) {
            this.foldersOf(userId).set(path, modified);
          } else {
            this.filesOf(userId).set(path, {
              segments,
              bytes,
              modified: new Date(modified),
              touched: modified,
            });
          }
        });
      });
    this.opened.set(userId, opened);
    return opened;
  }

  /** Wait until every change to a kept folder is stored. */
  settle(): Promise<void> {
    return this.pending;
  }

  private persist(write: () => Promise<void>): void {
    this.pending = this.pending.then(write);
  }

  get(userId: string, segments: string[]): ScratchFile | undefined {
    const file = this.live(userId).get(segments.join("/"));
    if (file) file.touched = this.now();
    return file;
  }

  /** A folder's own temporary files, by name. */
  list(userId: string, folder: string[]): ScratchFile[] {
    return [...this.live(userId).values()]
      .filter(
        (file) =>
          file.segments.length === folder.length + 1 &&
          folder.every((segment, index) => file.segments[index] === segment),
      )
      .sort((left, right) =>
        left.segments.join("/") < right.segments.join("/") ? -1 : 1,
      );
  }

  put(
    userId: string,
    segments: string[],
    bytes: Uint8Array<ArrayBuffer>,
  ): "created" | "replaced" | "full" {
    const files = this.live(userId);
    const key = segments.join("/");
    const replaced = files.get(key);
    // Kept folders and temporary files each have their own room.
    const kept = isKeptPath(segments);
    const held = [...files.values()]
      .filter((file) => isKeptPath(file.segments) === kept)
      .reduce((total, file) => total + file.bytes.byteLength, 0);
    if (
      held - (replaced?.bytes.byteLength ?? 0) + bytes.byteLength >
      (kept ? KEPT_CAP_BYTES : SCRATCH_CAP_BYTES)
    ) {
      return "full";
    }
    const now = this.now();
    files.set(key, { segments, bytes, modified: new Date(now), touched: now });
    this.files.set(userId, files);
    if (kept) {
      // A kept file's folders are kept with it: they are how it is found
      // again after a restart.
      segments
        .slice(0, -1)
        .forEach((_, index) =>
          this.makeFolder(userId, segments.slice(0, index + 1)),
        );
      this.persist(() =>
        this.kept.put(userId, { path: key, bytes, modified: now }),
      );
    }
    return replaced ? "replaced" : "created";
  }

  delete(userId: string, segments: string[]): boolean {
    const key = segments.join("/");
    const deleted = this.live(userId).delete(key);
    if (deleted && isKeptPath(segments)) {
      this.persist(() => this.kept.remove(userId, [key]));
    }
    return deleted;
  }

  /** Whether a person has made a folder here that holds nothing real yet. */
  hasFolder(userId: string, segments: string[]): boolean {
    const folders = this.liveFolders(userId);
    const key = segments.join("/");
    if (!folders.has(key)) return false;
    folders.set(key, this.now());
    return true;
  }

  /** The names of the folders a person made directly inside another. */
  listFolders(userId: string, parent: string[]): string[] {
    const prefix = parent.length > 0 ? `${parent.join("/")}/` : "";
    return [...this.liveFolders(userId).keys()]
      .filter(
        (key) =>
          key.startsWith(prefix) && !key.slice(prefix.length).includes("/"),
      )
      .map((key) => key.slice(prefix.length))
      .sort();
  }

  makeFolder(userId: string, segments: string[]): void {
    const folders = this.liveFolders(userId);
    const key = segments.join("/");
    const known = folders.has(key);
    const now = this.now();
    folders.set(key, now);
    this.folders.set(userId, folders);
    if (!known && isKeptPath(segments)) {
      this.persist(() => this.kept.put(userId, { path: key, modified: now }));
    }
  }

  /** Drop a folder a person made, with everything temporary inside it. */
  removeFolder(userId: string, segments: string[]): boolean {
    const key = segments.join("/");
    const inside = (candidate: string): boolean =>
      candidate === key || candidate.startsWith(`${key}/`);
    const folders = this.liveFolders(userId);
    if (!folders.has(key)) return false;
    const files = this.live(userId);
    const gone = [...folders.keys(), ...files.keys()].filter(inside);
    gone.forEach((name) => {
      folders.delete(name);
      files.delete(name);
    });
    if (isKeptPath(segments)) {
      this.persist(() => this.kept.remove(userId, gone));
    }
    return true;
  }

  /**
   * A folder that now holds an entity is real: it and the folders above it
   * stop being the person's own.
   */
  forgetFolders(userId: string, segments: string[]): void {
    const folders = this.liveFolders(userId);
    segments.forEach((_, index) =>
      folders.delete(segments.slice(0, index + 1).join("/")),
    );
  }

  /** Move a temporary file to another temporary name. */
  rename(
    userId: string,
    from: string[],
    to: string[],
  ): "created" | "replaced" | "missing" {
    const file = this.get(userId, from);
    if (!file) return "missing";
    const outcome = this.put(userId, to, file.bytes);
    if (outcome === "full") return "missing";
    this.delete(userId, from);
    return outcome;
  }

  private foldersOf(userId: string): Map<string, number> {
    const folders = this.folders.get(userId) ?? new Map<string, number>();
    this.folders.set(userId, folders);
    return folders;
  }

  private filesOf(userId: string): Map<string, StoredScratchFile> {
    const files =
      this.files.get(userId) ?? new Map<string, StoredScratchFile>();
    this.files.set(userId, files);
    return files;
  }

  private liveFolders(userId: string): Map<string, number> {
    const folders = this.folders.get(userId) ?? new Map<string, number>();
    const now = this.now();
    [...folders].forEach(([key, touched]) => {
      if (idle(key, touched, now)) folders.delete(key);
    });
    if (folders.size === 0) this.folders.delete(userId);
    return folders;
  }

  /** A person's files that are still in use; idle ones are dropped here. */
  private live(userId: string): Map<string, StoredScratchFile> {
    const files =
      this.files.get(userId) ?? new Map<string, StoredScratchFile>();
    const now = this.now();
    [...files].forEach(([key, file]) => {
      if (idle(key, file.touched, now)) files.delete(key);
    });
    if (files.size === 0) this.files.delete(userId);
    return files;
  }
}
