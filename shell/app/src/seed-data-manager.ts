import type { Logger } from "@brains/utils";
import * as fs from "fs/promises";
import * as path from "path";

export interface FileSystem {
  readdir: typeof fs.readdir;
  mkdir: typeof fs.mkdir;
  access: typeof fs.access;
  copyFile: typeof fs.copyFile;
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
    this.fs = fileSystem ?? fs;
  }

  public async initialize(): Promise<void> {
    try {
      this.logger.debug(`Checking brain-data at: ${this.brainDataDir}`);
      this.logger.debug(`Looking for seed-content at: ${this.seedContentDir}`);

      const isEmpty = await this.isBrainDataEmpty();

      if (isEmpty) {
        await this.copySeedContent();
      } else {
        this.logger.info(
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
      this.logger.info(`Initializing brain-data with seed content...`);

      await this.copyDirectory(this.seedContentDir, this.brainDataDir);

      this.logger.info("✅ Seed content copied successfully");
    } catch {
      this.logger.info(
        "No seed-content directory found, starting with empty brain-data",
      );
    }
  }

  private async copyDirectory(src: string, dest: string): Promise<void> {
    const entries = await this.fs.readdir(src, { withFileTypes: true });

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
