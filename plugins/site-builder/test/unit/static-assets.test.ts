import { describe, test, expect, beforeEach, mock } from "bun:test";
import { PreactBuilder } from "../../src/lib/preact-builder";
import type { StaticSiteBuilderOptions } from "../../src/lib/static-site-builder";
import { createSilentLogger } from "@brains/test-utils";
import { promises as fs } from "fs";
import type { Dirent } from "fs";

// Type for accessing private methods in tests
interface PreactBuilderTestable {
  copyStaticAssets(): Promise<void>;
  writeInlineStaticAssets(
    assets: Record<string, string> | undefined,
  ): Promise<void>;
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

describe("PreactBuilder - Inline Static Assets (from SitePackage)", () => {
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

  test("should write each inline static asset under the output dir", async () => {
    // Given a SitePackage that ships in-memory static assets (e.g.
    // a canvas script loaded via a text import), the builder should
    // write each entry to its declared path inside the output dir.
    const originalMkdir = fs.mkdir;
    const originalWriteFile = fs.writeFile;

    const mkdirCalls: string[] = [];
    const writeFileCalls: Array<[string, string]> = [];
    fs.mkdir = mock((path: string) => {
      mkdirCalls.push(path);
      return Promise.resolve(undefined);
    }) as typeof fs.mkdir;
    fs.writeFile = mock((path: string, content: string) => {
      writeFileCalls.push([path, content]);
      return Promise.resolve();
    }) as typeof fs.writeFile;

    try {
      await testableBuilder.writeInlineStaticAssets({
        "/canvases/tree.js": "(function(){/* tree */})();",
        "/canvases/constellation.js": "(function(){/* constellation */})();",
      });

      // One writeFile per asset
      expect(writeFileCalls).toHaveLength(2);

      // Each file is written under outputDir with the declared path
      const paths = writeFileCalls.map(([p]) => p).sort();
      expect(paths).toEqual([
        "/tmp/output/canvases/constellation.js",
        "/tmp/output/canvases/tree.js",
      ]);

      // Parent directory is created before writing
      expect(mkdirCalls.length).toBeGreaterThanOrEqual(1);

      // File contents match
      const treeEntry = writeFileCalls.find(([p]) => p.endsWith("tree.js"));
      expect(treeEntry?.[1]).toBe("(function(){/* tree */})();");
    } finally {
      fs.mkdir = originalMkdir;
      fs.writeFile = originalWriteFile;
    }
  });

  test("should be a no-op for an empty assets map", async () => {
    const originalWriteFile = fs.writeFile;
    const writeFileMock = mock(() => Promise.resolve());
    fs.writeFile = writeFileMock as typeof fs.writeFile;

    try {
      await testableBuilder.writeInlineStaticAssets({});
      expect(writeFileMock).not.toHaveBeenCalled();
    } finally {
      fs.writeFile = originalWriteFile;
    }
  });

  test("should be a no-op for an undefined assets map", async () => {
    const originalWriteFile = fs.writeFile;
    const writeFileMock = mock(() => Promise.resolve());
    fs.writeFile = writeFileMock as typeof fs.writeFile;

    try {
      await testableBuilder.writeInlineStaticAssets(undefined);
      expect(writeFileMock).not.toHaveBeenCalled();
    } finally {
      fs.writeFile = originalWriteFile;
    }
  });

  test("should strip leading slash from keys so paths resolve under outputDir", async () => {
    // `/canvases/tree.js` and `canvases/tree.js` should both land at
    // `<outputDir>/canvases/tree.js` — not at `/canvases/tree.js` on
    // the filesystem root.
    const originalMkdir = fs.mkdir;
    const originalWriteFile = fs.writeFile;
    fs.mkdir = mock(() => Promise.resolve(undefined)) as typeof fs.mkdir;
    const writeFileCalls: string[] = [];
    fs.writeFile = mock((path: string) => {
      writeFileCalls.push(path);
      return Promise.resolve();
    }) as typeof fs.writeFile;

    try {
      await testableBuilder.writeInlineStaticAssets({
        "/canvases/tree.js": "a",
        "canvases/relative.js": "b",
      });

      // Neither file should be written at a filesystem-root path
      for (const p of writeFileCalls) {
        expect(p.startsWith("/tmp/output/")).toBe(true);
      }
    } finally {
      fs.mkdir = originalMkdir;
      fs.writeFile = originalWriteFile;
    }
  });
});
