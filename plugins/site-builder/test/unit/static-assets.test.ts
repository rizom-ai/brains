import { describe, test, expect, mock } from "bun:test";
import {
  writeInlineStaticAssets,
  writePublicAssets,
} from "../../src/lib/react-builder";
import { createSilentLogger } from "@brains/test-utils";
import { promises as fs } from "fs";

describe("ReactBuilder - Snapshotted Public Assets", () => {
  const outputDir = "/tmp/output";
  const logger = createSilentLogger();

  test("writes nested binary assets from the prepared snapshot", async () => {
    const originalMkdir = fs.mkdir;
    const originalWriteFile = fs.writeFile;
    const writes: Array<[string, Uint8Array]> = [];
    fs.mkdir = mock(() => Promise.resolve(undefined)) as typeof fs.mkdir;
    fs.writeFile = mock((path: string, content: Uint8Array) => {
      writes.push([path, content]);
      return Promise.resolve();
    }) as typeof fs.writeFile;

    try {
      await writePublicAssets(
        {
          "icons/favicon.bin": Buffer.from([0, 1, 2, 3]).toString("base64"),
        },
        new AbortController().signal,
        outputDir,
        logger,
      );

      expect(writes).toHaveLength(1);
      expect(writes[0]?.[0]).toBe("/tmp/output/icons/favicon.bin");
      expect(
        Buffer.from(writes[0]?.[1] ?? []).equals(Buffer.from([0, 1, 2, 3])),
      ).toBe(true);
    } finally {
      fs.mkdir = originalMkdir;
      fs.writeFile = originalWriteFile;
    }
  });

  test("rejects snapshotted paths that escape output", async () => {
    expect(
      writePublicAssets(
        { "../outside.bin": "AA==" },
        new AbortController().signal,
        outputDir,
        logger,
      ),
    ).rejects.toThrow("path contains a .. segment");
  });
});

describe("ReactBuilder - Inline Static Assets (from SitePackage)", () => {
  const outputDir = "/tmp/output";
  const logger = createSilentLogger();

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
      await writeInlineStaticAssets(
        {
          "/canvases/tree.js": "(function(){/* tree */})();",
          "/canvases/constellation.js": "(function(){/* constellation */})();",
        },
        new AbortController().signal,
        outputDir,
        logger,
      );

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
      await writeInlineStaticAssets(
        {},
        new AbortController().signal,
        outputDir,
        logger,
      );
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
      await writeInlineStaticAssets(
        undefined,
        new AbortController().signal,
        outputDir,
        logger,
      );
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
      await writeInlineStaticAssets(
        {
          "/canvases/tree.js": "a",
          "canvases/relative.js": "b",
        },
        new AbortController().signal,
        outputDir,
        logger,
      );

      // Neither file should be written at a filesystem-root path
      for (const p of writeFileCalls) {
        expect(p.startsWith("/tmp/output/")).toBe(true);
      }
    } finally {
      fs.mkdir = originalMkdir;
      fs.writeFile = originalWriteFile;
    }
  });

  test("should reject paths that escape the output directory", async () => {
    const originalMkdir = fs.mkdir;
    const originalWriteFile = fs.writeFile;
    const mkdirMock = mock(() => Promise.resolve(undefined));
    const writeFileMock = mock(() => Promise.resolve());
    fs.mkdir = mkdirMock as typeof fs.mkdir;
    fs.writeFile = writeFileMock as typeof fs.writeFile;

    try {
      const writePromise = writeInlineStaticAssets(
        {
          "../outside.js": "unsafe",
        },
        new AbortController().signal,
        outputDir,
        logger,
      );
      expect(writePromise).rejects.toThrow("path contains a .. segment");
      await writePromise.catch(() => undefined);
      expect(mkdirMock).not.toHaveBeenCalled();
      expect(writeFileMock).not.toHaveBeenCalled();
    } finally {
      fs.mkdir = originalMkdir;
      fs.writeFile = originalWriteFile;
    }
  });
});
