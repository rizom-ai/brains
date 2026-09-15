import { test, expect } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { renderDirectoryPng } from "../src/render-file";

// Unit SDK collaborator only. The canonical candidate runs real WebView in Bun.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
test("directory rendering serves referenced files and returns only output facts", async () => {
  const sourceDirectory = await mkdtemp(join(tmpdir(), "render-directory-"));
  const outputFile = join(sourceDirectory, "rendered.png");
  const asset = Buffer.alloc(64 * 1024 + 3, 0x5a);
  await writeFile(
    join(sourceDirectory, "index.html"),
    '<html><body><img src="/cover.png"></body></html>',
  );
  await writeFile(join(sourceDirectory, "cover.png"), asset);
  const caller = new AbortController();
  let captureUrl = "";
  try {
    const result = await renderDirectoryPng(
      { sourceDirectory, outputFile },
      {
        screenshotPng: async (url, viewport, options): Promise<Buffer> => {
          captureUrl = url;
          expect(viewport).toEqual({ width: 1200, height: 630 });
          expect(options?.signal).toBe(caller.signal);
          expect(await (await fetch(url)).text()).toContain("/cover.png");
          expect(
            Buffer.from(
              await (await fetch(new URL("/cover.png", url))).arrayBuffer(),
            ),
          ).toEqual(asset);
          return png;
        },
      },
      caller.signal,
    );
    expect(result).toEqual({
      sizeBytes: png.length,
      sha256: createHash("sha256").update(png).digest("hex"),
    });
    expect(await readFile(outputFile)).toEqual(png);
    await assert.rejects(fetch(captureUrl));
  } finally {
    await rm(sourceDirectory, { recursive: true });
  }
});

test("failed rendering joins the server, preserves its cause and retains partial staging", async () => {
  const sourceDirectory = await mkdtemp(join(tmpdir(), "render-failure-"));
  const outputFile = join(sourceDirectory, "rendered.png");
  await writeFile(join(sourceDirectory, "index.html"), "<html></html>");
  const primary = new Error("SDK render failed");
  let captureUrl = "";
  try {
    await assert.rejects(
      renderDirectoryPng(
        { sourceDirectory, outputFile },
        {
          screenshotPng: async (url): Promise<never> => {
            captureUrl = url;
            throw primary;
          },
        },
      ),
      (error: unknown) => error === primary,
    );
    expect(await Bun.file(outputFile).exists()).toBe(false);
    expect(
      (await readdir(sourceDirectory)).filter((path) =>
        path.endsWith(".partial"),
      ),
    ).toHaveLength(1);
    await assert.rejects(fetch(captureUrl));
  } finally {
    await rm(sourceDirectory, { recursive: true });
  }
});
