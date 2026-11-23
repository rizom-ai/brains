import { TFile, TFolder, normalizePath, type App } from "obsidian";
import { z } from "@brains/utils/zod";
import { jsonOf, type SyncVault } from "../engine";

/** The settings Obsidian's Templates core plugin keeps; others are left. */
const templatesConfigSchema = z.looseObject({ folder: z.string().optional() });

/** How long after a change a file counts as being typed in. */
export const BUSY_MS = 5_000;
/** How long an event the plugin caused itself is told apart from the person's. */
const OWN_EVENT_MS = 2_000;

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

/**
 * The person's vault, as the sync engine sees it. Writes the plugin makes
 * are remembered for a moment, so the vault events they cause are not taken
 * for the person's edits, deletes or renames.
 */
export class ObsidianVault implements SyncVault {
  private readonly app: App;
  private readonly lastEdit = new Map<string, number>();
  private readonly ownEvents = new Map<string, number>();
  /** Folder making, one after another. */
  private folders: Promise<void> = Promise.resolve();

  constructor(app: App) {
    this.app = app;
  }

  /** Whether an event on a path was the plugin's own doing. */
  isOwnEvent(path: string): boolean {
    const until = this.ownEvents.get(path);
    if (until === undefined) return false;
    if (until < Date.now()) {
      this.ownEvents.delete(path);
      return false;
    }
    return true;
  }

  /** The person changed a file: it is busy for a moment. */
  noteEdit(path: string): void {
    if (!this.isOwnEvent(path)) this.lastEdit.set(path, Date.now());
  }

  private own(...paths: string[]): void {
    const until = Date.now() + OWN_EVENT_MS;
    for (const path of paths) this.ownEvents.set(path, until);
  }

  private file(path: string): TFile | undefined {
    const found = this.app.vault.getAbstractFileByPath(normalizePath(path));
    return found instanceof TFile ? found : undefined;
  }

  /**
   * Make the folders a file sits in. Files written at the same time into a
   * folder that is not there yet share one making of it, in order.
   */
  private ensureFolder(path: string): Promise<void> {
    const folder = path.split("/").slice(0, -1).join("/");
    if (folder === "") return Promise.resolve();
    const names = folder.split("/");
    // Each level from the top, so a folder is made after the one it is in.
    const levels = names.map((_, index) => names.slice(0, index + 1).join("/"));
    const making = this.folders.then(async () => {
      for (const level of levels) {
        const existing = this.app.vault.getAbstractFileByPath(level);
        if (existing instanceof TFolder) continue;
        this.own(level);
        await this.app.vault.createFolder(level);
      }
    });
    // The next one waits for this one, whether or not it worked.
    this.folders = making.catch(() => undefined);
    return making;
  }

  async listFiles(): Promise<string[]> {
    return this.app.vault.getFiles().map((file) => file.path);
  }

  async stat(
    path: string,
  ): Promise<{ size: number; mtime: number } | undefined> {
    const file = this.file(path);
    return file && { size: file.stat.size, mtime: file.stat.mtime };
  }

  async read(path: string): Promise<Uint8Array> {
    const file = this.file(path);
    if (!file) throw new Error(`No file ${path}`);
    return new Uint8Array(await this.app.vault.readBinary(file));
  }

  async write(path: string, bytes: Uint8Array): Promise<void> {
    this.own(path);
    const file = this.file(path);
    if (file) {
      await this.app.vault.modifyBinary(file, arrayBuffer(bytes));
      return;
    }
    await this.ensureFolder(path);
    await this.app.vault.createBinary(normalizePath(path), arrayBuffer(bytes));
  }

  async replaceText(
    path: string,
    expected: string,
    next: string,
  ): Promise<boolean> {
    const file = this.file(path);
    if (!file) return false;
    let replaced = false;
    this.own(path);
    await this.app.vault.process(file, (current) => {
      if (current !== expected) return current;
      replaced = true;
      return next;
    });
    return replaced;
  }

  isBusy(path: string): boolean {
    return Date.now() - (this.lastEdit.get(path) ?? 0) < BUSY_MS;
  }

  async trash(path: string): Promise<void> {
    const file = this.file(path);
    if (!file) return;
    this.own(path);
    await this.app.fileManager.trashFile(file);
  }

  async rename(from: string, to: string): Promise<void> {
    const file = this.file(from);
    if (!file) throw new Error(`No file ${from}`);
    await this.ensureFolder(to);
    this.own(from, to);
    await this.app.fileManager.renameFile(file, normalizePath(to));
  }

  async exists(path: string): Promise<boolean> {
    return this.app.vault.getAbstractFileByPath(normalizePath(path)) !== null;
  }

  /** Where Obsidian's core Templates plugin keeps its settings. */
  private templatesConfig(): string {
    return normalizePath(`${this.app.vault.configDir}/templates.json`);
  }

  async getTemplateFolder(): Promise<string | undefined> {
    const adapter = this.app.vault.adapter;
    const path = this.templatesConfig();
    if (!(await adapter.exists(path))) return undefined;
    const parsed = templatesConfigSchema.safeParse(
      jsonOf(await adapter.read(path)),
    );
    const folder = parsed.success ? parsed.data.folder : undefined;
    return folder === undefined || folder.trim() === "" ? undefined : folder;
  }

  async setTemplateFolder(folder: string): Promise<void> {
    const adapter = this.app.vault.adapter;
    const path = this.templatesConfig();
    const current = (await adapter.exists(path))
      ? templatesConfigSchema.safeParse(jsonOf(await adapter.read(path)))
      : undefined;
    await adapter.write(
      path,
      JSON.stringify(
        { ...(current?.success ? current.data : {}), folder },
        null,
        2,
      ),
    );
  }
}
