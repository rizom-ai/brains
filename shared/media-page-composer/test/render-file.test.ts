import { test, expect } from "bun:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
  symlink,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { renderDirectoryFile } from "../src/render-file";

test("PDF rendering selects print options and returns only file facts", async () => {
  const sourceDirectory = await mkdtemp(join(tmpdir(), "render-pdf-"));
  const outputFile = join(sourceDirectory, "verified");
  const pdf = Buffer.from("%PDF-1.7\nfixture");
  const caller = new AbortController();
  await writeFile(
    join(sourceDirectory, "index.html"),
    "<html>Printable</html>",
  );
  await writeFile(
    join(sourceDirectory, "render.json"),
    JSON.stringify({ format: "pdf" }),
  );
  try {
    const facts = await renderDirectoryFile(
      { sourceDirectory, outputFile },
      {
        screenshotPng: async (): Promise<never> => {
          throw new Error("Wrong render format");
        },
        renderPdf: async (url, options): Promise<Buffer> => {
          expect(await (await fetch(url)).text()).toContain("Printable");
          expect(options).toEqual({
            maxBytes: 25 * 1024 * 1024,
            timeoutMs: 60_000,
            printBackground: true,
            preferCSSPageSize: true,
            signal: caller.signal,
          });
          return pdf;
        },
      },
      caller.signal,
    );
    expect(facts).toEqual({
      sizeBytes: pdf.length,
      sha256: createHash("sha256").update(pdf).digest("hex"),
    });
    expect(await readFile(outputFile)).toEqual(pdf);
  } finally {
    await rm(sourceDirectory, { recursive: true });
  }
});

test("render metadata is explicit, bounded and regular before SDK acquisition", async () => {
  const sourceDirectory = await mkdtemp(join(tmpdir(), "render-request-"));
  await writeFile(join(sourceDirectory, "index.html"), "<html></html>");
  let acquired = 0;
  const unexpected = async (): Promise<never> => {
    acquired++;
    throw new Error("SDK must not run");
  };
  const input = {
    sourceDirectory,
    outputFile: join(sourceDirectory, "verified"),
  };
  try {
    await assert.rejects(
      renderDirectoryFile(input, {
        screenshotPng: unexpected,
        renderPdf: unexpected,
      }),
      /ENOENT/,
    );
    for (const text of [
      "x".repeat(129),
      "{",
      JSON.stringify({ format: "other" }),
      JSON.stringify({ format: "pdf", bytes: "forbidden" }),
    ]) {
      await writeFile(join(sourceDirectory, "render.json"), text);
      await assert.rejects(
        renderDirectoryFile(input, {
          screenshotPng: unexpected,
          renderPdf: unexpected,
        }),
      );
    }
    await rm(join(sourceDirectory, "render.json"));
    await symlink(
      join(sourceDirectory, "index.html"),
      join(sourceDirectory, "render.json"),
    );
    await assert.rejects(
      renderDirectoryFile(input, {
        screenshotPng: unexpected,
        renderPdf: unexpected,
      }),
    );
    expect(acquired).toBe(0);
    expect(await Bun.file(input.outputFile).exists()).toBe(false);
  } finally {
    await rm(sourceDirectory, { recursive: true });
  }
});

test("PDF limits, signature failure and cancellation retain staging and join serving", async () => {
  const sourceDirectory = await mkdtemp(join(tmpdir(), "render-pdf-failure-"));
  await writeFile(join(sourceDirectory, "index.html"), "<html></html>");
  await writeFile(
    join(sourceDirectory, "render.json"),
    JSON.stringify({ format: "pdf" }),
  );
  const input = {
    sourceDirectory,
    outputFile: join(sourceDirectory, "verified"),
  };
  let url = "";
  try {
    for (const [bytes, expected] of [
      [Buffer.alloc(25 * 1024 * 1024 + 1), /size limit/],
      [Buffer.from("not-pdf"), /PDF signature/],
      [Buffer.from([0xa5, 0xd0, 0xc4, 0xc6, 0xad]), /PDF signature/],
    ] as const) {
      await assert.rejects(
        renderDirectoryFile(input, {
          renderPdf: async (address): Promise<Buffer> => {
            url = address;
            return bytes;
          },
        }),
        expected,
      );
      await assert.rejects(fetch(url));
    }
    const caller = new AbortController();
    const primary = new Error("PDF cancelled");
    await assert.rejects(
      renderDirectoryFile(
        input,
        {
          renderPdf: async (address, options): Promise<Buffer> => {
            url = address;
            expect(options?.signal).toBe(caller.signal);
            caller.abort(primary);
            return Buffer.from("%PDF-1.7\n");
          },
        },
        caller.signal,
      ),
      (error: unknown) => error === primary,
    );
    await assert.rejects(fetch(url));
    expect(await Bun.file(input.outputFile).exists()).toBe(false);
    expect(
      (await readdir(sourceDirectory)).filter((path) =>
        path.endsWith(".partial"),
      ),
    ).toHaveLength(4);
  } finally {
    await rm(sourceDirectory, { recursive: true });
  }
});

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
  await writeFile(
    join(sourceDirectory, "render.json"),
    JSON.stringify({ format: "image" }),
  );
  const caller = new AbortController();
  let captureUrl = "";
  try {
    const result = await renderDirectoryFile(
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
  await writeFile(
    join(sourceDirectory, "render.json"),
    JSON.stringify({ format: "image" }),
  );
  const primary = new Error("SDK render failed");
  let captureUrl = "";
  try {
    await assert.rejects(
      renderDirectoryFile(
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
