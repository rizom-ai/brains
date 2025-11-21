import { describe, test, expect, beforeEach, mock } from "bun:test";
import { PreactBuilder } from "../../src/lib/preact-builder";
import type { StaticSiteBuilderOptions } from "../../src/lib/static-site-builder";
import { createSilentLogger } from "@brains/utils";
import { promises as fs } from "fs";

describe("PreactBuilder - Static Assets", () => {
  let builder: PreactBuilder;

  beforeEach(() => {
    const options: StaticSiteBuilderOptions = {
      logger: createSilentLogger(),
      workingDir: "/tmp/working",
      outputDir: "/tmp/output",
    };
    builder = new PreactBuilder(options);
  });

  test("should skip gracefully when public/ directory doesn't exist", async () => {
    // Mock fs.access to throw (directory doesn't exist)
    const originalAccess = fs.access;
    fs.access = mock(() => Promise.reject(new Error("ENOENT")));

    try {
      // Call private method via any cast - should not throw
      await (builder as any).copyStaticAssets();

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
        { name: "favicon.svg", isDirectory: () => false },
        { name: "robots.txt", isDirectory: () => false },
      ] as any),
    );
    const copyFileMock = mock(() => Promise.resolve());
    fs.copyFile = copyFileMock;

    try {
      await (builder as any).copyStaticAssets();

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
        return Promise.resolve([
          { name: "images", isDirectory: () => true },
        ] as any);
      } else {
        // Second call (inside images/)
        return Promise.resolve([
          { name: "logo.png", isDirectory: () => false },
        ] as any);
      }
    });

    const mkdirMock = mock(() => Promise.resolve());
    const copyFileMock = mock(() => Promise.resolve());
    fs.mkdir = mkdirMock;
    fs.copyFile = copyFileMock;

    try {
      await (builder as any).copyStaticAssets();

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
