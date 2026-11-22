/**
 * The vault as the sync engine sees it: files by path, `/`-separated, with
 * no leading slash. Obsidian's vault is one; the tests hold one in memory.
 */
export interface SyncVault {
  /** Every file in the vault. Obsidian's own folder is not among them. */
  listFiles(): Promise<string[]>;
  /** A file's size and modification time, or nothing when it is not there. */
  stat(path: string): Promise<{ size: number; mtime: number } | undefined>;
  read(path: string): Promise<Uint8Array>;
  /** Create or replace a file, making its folders. */
  write(path: string, bytes: Uint8Array): Promise<void>;
  /**
   * Replace a text file only while it still holds `expected`. False when
   * the person changed it meanwhile: nothing is written then.
   */
  replaceText(path: string, expected: string, next: string): Promise<boolean>;
  /** Whether the person changed the file a moment ago and may be typing in it. */
  isBusy(path: string): boolean;
  /** Delete a file the way the person's settings say: to a trash, mostly. */
  trash(path: string): Promise<void>;
  /** Move a file, making its folders, and update links to it. */
  rename(from: string, to: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  /** The folder Obsidian's Templates takes templates from, when one is set. */
  getTemplateFolder(): Promise<string | undefined>;
  setTemplateFolder(folder: string): Promise<void>;
}

/** A vault held in memory, for the tests and for planning. */
export class MemoryVault implements SyncVault {
  readonly files: Map<string, { bytes: Uint8Array; mtime: number }> = new Map();
  readonly trashed: string[] = [];
  readonly busy: Set<string> = new Set();
  /** Obsidian's Templates setting, as the person or the plugin left it. */
  templateFolder: string | undefined;
  private clock = 1;

  async listFiles(): Promise<string[]> {
    return [...this.files.keys()].sort();
  }

  async stat(
    path: string,
  ): Promise<{ size: number; mtime: number } | undefined> {
    const file = this.files.get(path);
    return file && { size: file.bytes.byteLength, mtime: file.mtime };
  }

  async read(path: string): Promise<Uint8Array> {
    const file = this.files.get(path);
    if (!file) throw new Error(`No file ${path}`);
    return file.bytes;
  }

  async write(path: string, bytes: Uint8Array): Promise<void> {
    this.clock += 1;
    this.files.set(path, { bytes, mtime: this.clock });
  }

  /** Write a file as the person would: it is then theirs, and changed. */
  setText(path: string, text: string): void {
    this.clock += 1;
    this.files.set(path, {
      bytes: new TextEncoder().encode(text),
      mtime: this.clock,
    });
  }

  text(path: string): string | undefined {
    const file = this.files.get(path);
    return file && new TextDecoder().decode(file.bytes);
  }

  async replaceText(
    path: string,
    expected: string,
    next: string,
  ): Promise<boolean> {
    if (this.text(path) !== expected) return false;
    await this.write(path, new TextEncoder().encode(next));
    return true;
  }

  isBusy(path: string): boolean {
    return this.busy.has(path);
  }

  async trash(path: string): Promise<void> {
    this.files.delete(path);
    this.trashed.push(path);
  }

  async rename(from: string, to: string): Promise<void> {
    const file = this.files.get(from);
    if (!file) throw new Error(`No file ${from}`);
    this.files.delete(from);
    this.files.set(to, file);
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async getTemplateFolder(): Promise<string | undefined> {
    return this.templateFolder;
  }

  async setTemplateFolder(folder: string): Promise<void> {
    this.templateFolder = folder;
  }
}
