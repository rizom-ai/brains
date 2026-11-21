import {
  DOCUMENT_EXTENSIONS,
  IMAGE_EXTENSIONS,
} from "@brains/entity-placement";
import { posix } from "path";

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

  constructor(now: () => number = Date.now) {
    this.now = now;
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
    const held = [...files.values()].reduce(
      (total, file) => total + file.bytes.byteLength,
      0,
    );
    if (
      held - (replaced?.bytes.byteLength ?? 0) + bytes.byteLength >
      SCRATCH_CAP_BYTES
    ) {
      return "full";
    }
    const now = this.now();
    files.set(key, { segments, bytes, modified: new Date(now), touched: now });
    this.files.set(userId, files);
    return replaced ? "replaced" : "created";
  }

  delete(userId: string, segments: string[]): boolean {
    return this.live(userId).delete(segments.join("/"));
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
    folders.set(segments.join("/"), this.now());
    this.folders.set(userId, folders);
  }

  /** Drop a folder a person made, with everything temporary inside it. */
  removeFolder(userId: string, segments: string[]): boolean {
    const key = segments.join("/");
    const inside = (candidate: string): boolean =>
      candidate === key || candidate.startsWith(`${key}/`);
    const folders = this.liveFolders(userId);
    if (!folders.has(key)) return false;
    [...folders.keys()].filter(inside).forEach((name) => folders.delete(name));
    const files = this.live(userId);
    [...files.keys()].filter(inside).forEach((name) => files.delete(name));
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

  private liveFolders(userId: string): Map<string, number> {
    const folders = this.folders.get(userId) ?? new Map<string, number>();
    const now = this.now();
    [...folders].forEach(([key, touched]) => {
      if (now - touched >= SCRATCH_IDLE_MS) folders.delete(key);
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
      if (now - file.touched >= SCRATCH_IDLE_MS) files.delete(key);
    });
    if (files.size === 0) this.files.delete(userId);
    return files;
  }
}
