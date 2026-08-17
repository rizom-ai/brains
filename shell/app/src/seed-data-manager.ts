import type { Logger } from "@brains/utils/logger";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * The filesystem calls this manager makes, as it makes them.
 *
 * Declared rather than aliased to `typeof fs.readdir` and friends: node types
 * those as overload sets spanning encodings, Buffers and Dirents, and no stand-in
 * can satisfy an overload set structurally. The real fs functions are assignable
 * to these signatures, so production is unaffected, and a test can supply four
 * functions that get checked.
 */
/** A directory entry, as this manager reads it. */
export interface DirectoryEntry {
  name: string;
  isDirectory(): boolean;
}

/**
 * The filesystem calls this manager makes, as it makes them.
 *
 * Declared rather than aliased to `typeof fs.readdir` and friends: node types
 * those as overload sets spanning encodings, Buffers and Dirents, and nothing
 * can satisfy an overload set structurally — which is why every test stub here
 * used to be asserted into place.
 *
 * The two directory reads are separate members for the same reason. They are
 * genuinely two different calls, and splitting them means each has one
 * signature a stub can implement, rather than one overloaded member that none
 * can.
 */
export interface FileSystem {
  readdir(path: string): Promise<string[]>;
  readdirWithFileTypes(path: string): Promise<DirectoryEntry[]>;
  mkdir(
    path: string,
    options: { recursive: true },
  ): Promise<string | undefined>;
  access(path: string): Promise<void>;
  copyFile(src: string, dest: string): Promise<void>;
}

export class SeedDataManager {
  private logger: Logger;
  private brainDataDir: string;
  private seedContentDir: string;
  private fs: FileSystem;

  constructor(
    logger: Logger,
    brainDataDir?: string,
    seedContentDir?: string,
    fileSystem?: FileSystem,
  ) {
    this.logger = logger;
    this.brainDataDir =
      brainDataDir ?? path.resolve(process.cwd(), "brain-data");
    this.seedContentDir =
      seedContentDir ?? path.resolve(process.cwd(), "seed-content");
    // node's fs satisfies every member except the split directory read, which
    // it spells as an option rather than a second function.
    this.fs = fileSystem ?? {
      readdir: (dir: string): Promise<string[]> => fs.readdir(dir),
      readdirWithFileTypes: (dir: string): Promise<DirectoryEntry[]> =>
        fs.readdir(dir, { withFileTypes: true }),
      mkdir: (
        dir: string,
        options: { recursive: true },
      ): Promise<string | undefined> => fs.mkdir(dir, options),
      access: (target: string): Promise<void> => fs.access(target),
      copyFile: (src: string, dest: string): Promise<void> =>
        fs.copyFile(src, dest),
    };
  }

  public async initialize(): Promise<void> {
    try {
      this.logger.debug(`Checking brain-data at: ${this.brainDataDir}`);
      this.logger.debug(`Looking for seed-content at: ${this.seedContentDir}`);

      const isEmpty = await this.isBrainDataEmpty();

      if (isEmpty) {
        await this.copySeedContent();
      } else {
        this.logger.debug(
          "brain-data directory not empty, skipping seed content initialization",
        );
      }
    } catch (error) {
      this.logger.warn("Failed to initialize seed data:", error);
    }
  }

  private async isBrainDataEmpty(): Promise<boolean> {
    try {
      const files = await this.fs.readdir(this.brainDataDir);
      this.logger.debug(`brain-data exists with ${files.length} files`);
      return files.length === 0;
    } catch {
      this.logger.debug("brain-data directory doesn't exist, creating it");
      await this.fs.mkdir(this.brainDataDir, { recursive: true });
      return true;
    }
  }

  private async copySeedContent(): Promise<void> {
    try {
      await this.fs.access(this.seedContentDir);
      this.logger.debug(`Initializing brain-data with seed content...`);

      await this.copyDirectory(this.seedContentDir, this.brainDataDir);

      this.logger.debug("Seed content copied successfully");
    } catch {
      this.logger.debug(
        "No seed-content directory found, starting with empty brain-data",
      );
    }
  }

  private async copyDirectory(src: string, dest: string): Promise<void> {
    const entries = await this.fs.readdirWithFileTypes(src);

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.fs.mkdir(destPath, { recursive: true });
        await this.copyDirectory(srcPath, destPath);
      } else {
        await this.fs.copyFile(srcPath, destPath);
      }
    }
  }
}
