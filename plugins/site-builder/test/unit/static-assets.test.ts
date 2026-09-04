import { describe, test, expect, spyOn } from "bun:test";
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
    const writes: Array<[string, Uint8Array]> = [];
    // spyOn types the stub by the member it replaces and restores it itself,
    // so neither the signature nor the teardown is asserted into place.
    const mkdir = spyOn(fs, "mkdir").mockResolvedValue(undefined);
    const writeFile = spyOn(fs, "writeFile").mockImplementation(
      async (path, content) => {
        if (!(content instanceof Uint8Array)) {
          throw new Error("Expected binary asset content");
        }
        writes.push([String(path), content]);
      },
    );

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
      mkdir.mockRestore();
      writeFile.mockRestore();
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
    const mkdirCalls: string[] = [];
    const writeFileCalls: Array<[string, string]> = [];
    const mkdir = spyOn(fs, "mkdir").mockImplementation(async (path) => {
      mkdirCalls.push(String(path));
      return undefined;
    });
    const writeFile = spyOn(fs, "writeFile").mockImplementation(
      async (path, content) => {
        if (typeof content !== "string") {
          throw new Error("Expected inline asset content to be text");
        }
        writeFileCalls.push([String(path), content]);
      },
    );

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
      mkdir.mockRestore();
      writeFile.mockRestore();
    }
  });

  test("should be a no-op for an empty assets map", async () => {
    const writeFileMock = spyOn(fs, "writeFile").mockResolvedValue(undefined);

    try {
      await writeInlineStaticAssets(
        {},
        new AbortController().signal,
        outputDir,
        logger,
      );
      expect(writeFileMock).not.toHaveBeenCalled();
    } finally {
      writeFileMock.mockRestore();
    }
  });

  test("should be a no-op for an undefined assets map", async () => {
    const writeFileMock = spyOn(fs, "writeFile").mockResolvedValue(undefined);

    try {
      await writeInlineStaticAssets(
        undefined,
        new AbortController().signal,
        outputDir,
        logger,
      );
      expect(writeFileMock).not.toHaveBeenCalled();
    } finally {
      writeFileMock.mockRestore();
    }
  });

  test("should strip leading slash from keys so paths resolve under outputDir", async () => {
    // `/canvases/tree.js` and `canvases/tree.js` should both land at
    // `<outputDir>/canvases/tree.js` — not at `/canvases/tree.js` on
    // the filesystem root.
    const mkdir = spyOn(fs, "mkdir").mockResolvedValue(undefined);
    const writeFileCalls: string[] = [];
    const writeFile = spyOn(fs, "writeFile").mockImplementation(
      async (path) => {
        writeFileCalls.push(String(path));
      },
    );

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
      mkdir.mockRestore();
      writeFile.mockRestore();
    }
  });

  test("should reject paths that escape the output directory", async () => {
    const mkdirMock = spyOn(fs, "mkdir").mockResolvedValue(undefined);
    const writeFileMock = spyOn(fs, "writeFile").mockResolvedValue(undefined);

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
      mkdirMock.mockRestore();
      writeFileMock.mockRestore();
    }
  });
});
