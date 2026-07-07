import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface JsonFileStoreOptions<T> {
  filePath: string;
  /** Validates raw JSON into the store shape; may throw on invalid input. */
  parse: (value: unknown) => T;
  empty: () => T;
  logError?: (message: string, cause: unknown) => void;
  /**
   * What to do when the file exists but can't be parsed.
   *
   * - "quarantine" (default): move the file aside and start empty. Right for
   *   stores where empty just means re-authenticating (sessions, codes).
   * - "throw": leave the file in place and fail the read. Right for
   *   identity-defining stores (passkeys, setup state) where silently
   *   starting empty would change the security posture.
   */
  onCorrupt?: "quarantine" | "throw";
}

/**
 * Shared persistence for the JSON-file-backed auth stores: serialized
 * writes, atomic replace (tmp file + rename), and configurable corrupt-file
 * handling so a bad file never silently bricks — or silently resets — an
 * auth surface.
 */
export class JsonFileStore<T> {
  private readonly filePath: string;
  private readonly parse: (value: unknown) => T;
  private readonly empty: () => T;
  private readonly logError: (message: string, cause: unknown) => void;
  private readonly onCorrupt: "quarantine" | "throw";
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(options: JsonFileStoreOptions<T>) {
    this.filePath = options.filePath;
    this.parse = options.parse;
    this.empty = options.empty;
    this.onCorrupt = options.onCorrupt ?? "quarantine";
    this.logError =
      options.logError ??
      ((message, cause): void => {
        console.error(message, cause);
      });
  }

  async enqueueWrite(operation: () => Promise<void>): Promise<void> {
    this.writeQueue = this.writeQueue.then(operation, operation);
    return this.writeQueue;
  }

  async read(): Promise<T> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return this.empty();
      }
      throw error;
    }

    try {
      return this.parse(JSON.parse(raw) as unknown);
    } catch (error) {
      if (this.onCorrupt === "throw") {
        throw new Error(
          `Corrupt JSON store at ${this.filePath}; refusing to start empty. Inspect or remove the file to proceed.`,
          { cause: error },
        );
      }
      await this.quarantineCorruptFile(error);
      return this.empty();
    }
  }

  async write(value: T): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    const tmpFile = `${this.filePath}.tmp`;
    await writeFile(tmpFile, `${JSON.stringify(value, null, 2)}\n`, {
      mode: 0o600,
    });
    await chmod(tmpFile, 0o600);
    await rename(tmpFile, this.filePath);
  }

  private async quarantineCorruptFile(cause: unknown): Promise<void> {
    const corruptFile = `${this.filePath}.corrupt-${process.pid}`;
    this.logError(
      `Corrupt JSON store at ${this.filePath}; moving it to ${corruptFile} and starting from an empty store`,
      cause,
    );
    try {
      await rename(this.filePath, corruptFile);
    } catch (renameError) {
      this.logError(
        `Failed to quarantine corrupt JSON store at ${this.filePath}`,
        renameError,
      );
    }
  }
}
