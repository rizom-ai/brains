import { describe, test, expect, beforeEach, mock } from "bun:test";
import { PreactBuilder } from "../../src/lib/preact-builder";
import type { StaticSiteBuilderOptions } from "../../src/lib/static-site-builder";
import { createSilentLogger } from "@brains/utils";
import { promises as fs } from "fs";
import type { Dirent } from "fs";

// Type for accessing private methods in tests
interface PreactBuilderTestable {
  copyStaticAssets(): Promise<void>;
}

// Helper to create mock Dirent objects
function createMockDirent(name: string, isDir: boolean): Dirent {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
    path: "",
    parentPath: "",
  } as Dirent;
}

describe("PreactBuilder - Static Assets", () => {
  let builder: PreactBuilder;
  let testableBuilder: PreactBuilderTestable;

  beforeEach(() => {
    const options: StaticSiteBuilderOptions = {
      logger: createSilentLogger(),
      workingDir: "/tmp/working",
      outputDir: "/tmp/output",
    };
    builder = new PreactBuilder(options);
    testableBuilder = builder as unknown as PreactBuilderTestable;
  });

  test("should skip gracefully when public/ directory doesn't exist", async () => {
    // Mock fs.access to throw (directory doesn't exist)
    const originalAccess = fs.access;
    fs.access = mock(() => Promise.reject(new Error("ENOENT")));

    try {
      // Call private method - should not throw
      await testableBuilder.copyStaticAssets();

      // If we get here, it handled the missing directory gracefully
      expect(true).toBe(true);
    } finally {
      fs.access = originalAccess;
    }
  });

  test("should copy files from public/ directory", async () => {
    // Mock fs operations
    const originalAccess = fs.access;
    const originalReaddir = fs.readdir;
    const originalCopyFile = fs.copyFile;

    fs.access = mock(() => Promise.resolve());
    fs.readdir = mock(() =>
      Promise.resolve([
        createMockDirent("favicon.svg", false),
        createMockDirent("robots.txt", false),
      ]),
    ) as unknown as typeof fs.readdir;
    const copyFileMock = mock(() => Promise.resolve());
    fs.copyFile = copyFileMock;

    try {
      await testableBuilder.copyStaticAssets();

      expect(copyFileMock).toHaveBeenCalledTimes(2);
    } finally {
      fs.access = originalAccess;
      fs.readdir = originalReaddir;
      fs.copyFile = originalCopyFile;
    }
  });

  test("should recursively copy directories", async () => {
    // Mock fs operations
    const originalAccess = fs.access;
    const originalReaddir = fs.readdir;
    const originalCopyFile = fs.copyFile;
    const originalMkdir = fs.mkdir;

    fs.access = mock(() => Promise.resolve());

    // First readdir call returns directory
    let readdirCallCount = 0;
    fs.readdir = mock(() => {
      readdirCallCount++;
      if (readdirCallCount === 1) {
        return Promise.resolve([createMockDirent("images", true)]);
      } else {
        // Second call (inside images/)
        return Promise.resolve([createMockDirent("logo.png", false)]);
      }
    }) as unknown as typeof fs.readdir;

    const mkdirMock = mock(() => Promise.resolve(undefined));
    const copyFileMock = mock(() => Promise.resolve());
    fs.mkdir = mkdirMock as typeof fs.mkdir;
    fs.copyFile = copyFileMock;

    try {
      await testableBuilder.copyStaticAssets();

      expect(mkdirMock).toHaveBeenCalled();
      expect(copyFileMock).toHaveBeenCalledTimes(1);
    } finally {
      fs.access = originalAccess;
      fs.readdir = originalReaddir;
      fs.copyFile = originalCopyFile;
      fs.mkdir = originalMkdir;
    }
  });
});
