import { describe, it, expect, beforeEach, mock } from "bun:test";
import { SeedDataManager, type FileSystem } from "../src/seed-data-manager";
import type { Logger } from "@brains/utils";
import * as fs from "fs/promises";
import * as path from "path";

describe("SeedDataManager", () => {
  let mockLogger: Logger;
  let mockFs: FileSystem;
  let seedDataManager: SeedDataManager;
  const testBrainDataDir = "/test/brain-data";
  const testSeedContentDir = "/test/seed-content";

  beforeEach(() => {
    mockLogger = {
      debug: mock(() => {}),
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
    } as unknown as Logger;

    mockFs = {
      readdir: mock(() => Promise.resolve([])),
      mkdir: mock(() => Promise.resolve(undefined)),
      access: mock(() => Promise.resolve()),
      copyFile: mock(() => Promise.resolve()),
    } as unknown as FileSystem;

    seedDataManager = new SeedDataManager(
      mockLogger,
      testBrainDataDir,
      testSeedContentDir,
      mockFs,
    );
  });

  describe("initialize", () => {
    it("should create brain-data directory if it doesn't exist", async () => {
      mockFs.readdir = mock(() => Promise.reject(new Error("ENOENT")));
      mockFs.mkdir = mock(() => Promise.resolve(undefined));
      mockFs.access = mock(() => Promise.reject(new Error("ENOENT")));

      await seedDataManager.initialize();

      expect(mockFs.mkdir).toHaveBeenCalledWith(testBrainDataDir, {
        recursive: true,
      });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "No seed-content directory found, starting with empty brain-data",
      );
    });

    it("should skip initialization if brain-data is not empty", async () => {
      mockFs.readdir = mock(() =>
        Promise.resolve(["file1.md", "file2.md"]),
      ) as unknown as typeof fs.readdir;

      await seedDataManager.initialize();

      expect(mockLogger.debug).toHaveBeenCalledWith(
        "brain-data directory not empty, skipping seed content initialization",
      );
      expect(mockFs.access).not.toHaveBeenCalled();
    });

    it("should copy seed content when brain-data is empty", async () => {
      let readdirCallCount = 0;
      mockFs.readdir = mock(() => {
        readdirCallCount++;
        if (readdirCallCount === 1) return Promise.resolve([]);
        if (readdirCallCount === 2)
          return Promise.resolve([
            { name: "file1.md", isDirectory: (): boolean => false },
            { name: "subdir", isDirectory: (): boolean => true },
          ]);
        return Promise.resolve([
          { name: "file2.md", isDirectory: (): boolean => false },
        ]);
      }) as unknown as typeof fs.readdir;
      mockFs.access = mock(() => Promise.resolve());
      mockFs.copyFile = mock(() => Promise.resolve());
      mockFs.mkdir = mock(() => Promise.resolve(undefined));

      await seedDataManager.initialize();

      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Initializing brain-data with seed content...",
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Seed content copied successfully",
      );
    });

    it("should handle errors gracefully", async () => {
      // First call to readdir fails with permission error
      // This will trigger mkdir in isBrainDataEmpty catch block
      mockFs.readdir = mock(() =>
        Promise.reject(new Error("Permission denied")),
      );
      // Make mkdir also fail to trigger the warning
      mockFs.mkdir = mock(() => Promise.reject(new Error("Permission denied")));

      await seedDataManager.initialize();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Failed to initialize seed data:",
        expect.any(Error),
      );
    });

    it("should recursively copy directories", async () => {
      let readdirCallCount = 0;
      mockFs.readdir = mock(() => {
        readdirCallCount++;
        if (readdirCallCount === 1) return Promise.resolve([]);
        if (readdirCallCount === 2)
          return Promise.resolve([
            { name: "dir1", isDirectory: (): boolean => true },
            { name: "file1.md", isDirectory: (): boolean => false },
          ]);
        return Promise.resolve([
          { name: "file2.md", isDirectory: (): boolean => false },
        ]);
      }) as unknown as typeof fs.readdir;
      mockFs.access = mock(() => Promise.resolve());
      mockFs.copyFile = mock(() => Promise.resolve());
      mockFs.mkdir = mock(() => Promise.resolve(undefined));

      await seedDataManager.initialize();

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        path.join(testBrainDataDir, "dir1"),
        { recursive: true },
      );
      expect(mockFs.copyFile).toHaveBeenCalledWith(
        path.join(testSeedContentDir, "file1.md"),
        path.join(testBrainDataDir, "file1.md"),
      );
      expect(mockFs.copyFile).toHaveBeenCalledWith(
        path.join(testSeedContentDir, "dir1", "file2.md"),
        path.join(testBrainDataDir, "dir1", "file2.md"),
      );
    });
  });
});
