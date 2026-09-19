import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderDirectoryFile } from "../src/render-file";
import { withPreviewPdfFile } from "../src/preview-pdf";
import { previewPdfRequestSchema } from "../src/preview-pdf-request";

const request = {
  url: "http://127.0.0.1:1234/preview?view=print",
  maxBytes: 1024,
  timeoutMs: 5000,
  width: "8in",
  height: 1000,
  format: "Letter",
};

test("preview PDF rendering forwards URL and print options without requiring an index file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "preview-pdf-"));
  const outputFile = join(directory, "verified");
  const pdf = Buffer.from("%PDF-1.7\npreview");
  await writeFile(
    join(directory, "render.json"),
    JSON.stringify({ format: "preview-pdf" }),
  );
  await writeFile(join(directory, "preview.json"), JSON.stringify(request));
  const caller = new AbortController();
  try {
    const result = await renderDirectoryFile(
      { sourceDirectory: directory, outputFile },
      {
        renderPdf: async (url, options): Promise<Buffer> => {
          expect(url).toBe(request.url);
          expect(options).toEqual({
            maxBytes: request.maxBytes,
            timeoutMs: request.timeoutMs,
            width: request.width,
            height: request.height,
            format: request.format,
            printBackground: true,
            preferCSSPageSize: true,
            signal: caller.signal,
          });
          return pdf;
        },
      },
      caller.signal,
    );
    expect(result.sizeBytes).toBe(pdf.length);
    expect(await readFile(outputFile)).toEqual(pdf);
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("preview metadata and configured output limits fail before publication", async () => {
  const directory = await mkdtemp(join(tmpdir(), "preview-pdf-failure-"));
  const input = {
    sourceDirectory: directory,
    outputFile: join(directory, "verified"),
  };
  await writeFile(
    join(directory, "render.json"),
    JSON.stringify({ format: "preview-pdf" }),
  );
  let acquired = 0;
  try {
    for (const text of [
      "x".repeat(8193),
      JSON.stringify({ ...request, bytes: "forbidden" }),
      JSON.stringify({ ...request, maxBytes: 100 * 1024 * 1024 + 1 }),
    ]) {
      await writeFile(join(directory, "preview.json"), text);
      await assert.rejects(
        renderDirectoryFile(input, {
          renderPdf: async (): Promise<never> => {
            acquired++;
            throw new Error("Unexpected SDK");
          },
        }),
      );
    }
    expect(acquired).toBe(0);
    await writeFile(
      join(directory, "preview.json"),
      JSON.stringify({ ...request, maxBytes: 5 }),
    );
    await assert.rejects(
      renderDirectoryFile(input, {
        renderPdf: async (): Promise<Buffer> => Buffer.from("%PDF-1.7"),
      }),
      /size limit/,
    );
    await assert.rejects(
      renderDirectoryFile(input, {
        renderPdf: async (): Promise<Buffer> => Buffer.from("wrong"),
      }),
      /PDF signature/,
    );
    expect(await Bun.file(input.outputFile).exists()).toBe(false);
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("preview metadata preserves HTTP(S) reachability and bounds encoded instructions", async () => {
  for (const url of [
    "http://127.0.0.1/preview",
    "http://10.0.0.1/preview",
    "https://user:fixture@example.test/preview",
  ]) {
    expect(previewPdfRequestSchema.parse({ url }).url).toBe(url);
  }
  expect(
    previewPdfRequestSchema.safeParse({ url: "file:///tmp/preview.html" })
      .success,
  ).toBe(false);
  let acquired = false;
  await assert.rejects(
    withPreviewPdfFile(
      { url: `https://example.test/${"漢".repeat(3000)}` },
      {
        withProducedFile: async (): Promise<never> => {
          acquired = true;
          throw new Error("Unexpected producer");
        },
      },
      async () => "unexpected",
    ),
    /metadata limit/,
  );
  expect(acquired).toBe(false);
});

test("preview cancellation before acquisition never enters the producer", async () => {
  const caller = new AbortController();
  const primary = new Error("preview cancelled");
  caller.abort(primary);
  let acquired = 0;
  await assert.rejects(
    withPreviewPdfFile(
      request,
      {
        withProducedFile: async (): Promise<never> => {
          acquired++;
          throw new Error("Unexpected producer");
        },
      },
      async () => "unexpected",
      { signal: caller.signal },
    ),
    (error: unknown) => error === primary,
  );
  await assert.rejects(
    withPreviewPdfFile(request, {}, async () => "unexpected"),
    /not provisioned/,
  );
  expect(acquired).toBe(0);
});

test("preview actor cancellation preserves the cause and leaves no published output", async () => {
  const directory = await mkdtemp(join(tmpdir(), "preview-pdf-cancelled-"));
  const outputFile = join(directory, "verified");
  await writeFile(
    join(directory, "render.json"),
    JSON.stringify({ format: "preview-pdf" }),
  );
  await writeFile(join(directory, "preview.json"), JSON.stringify(request));
  const caller = new AbortController();
  const primary = new Error("SDK cancelled");
  await assert.rejects(
    renderDirectoryFile(
      { sourceDirectory: directory, outputFile },
      {
        renderPdf: async (_url, options): Promise<Buffer> => {
          expect(options?.signal).toBe(caller.signal);
          caller.abort(primary);
          return Buffer.from("%PDF-1.7");
        },
      },
      caller.signal,
    ),
    (error: unknown) => error === primary,
  );
  expect(await Bun.file(outputFile).exists()).toBe(false);
  // Retain the actor's failed staging and original metadata.
});

test("preview controller lends metadata staging through consumption and retains failed work", async () => {
  let directory = "";
  const files = {
    withProducedFile: async <T>(
      sourceDirectory: string,
      use: (
        file: { sourceFile: string; sizeBytes: number; sha256: string },
        signal: AbortSignal,
      ) => Promise<T>,
    ): Promise<T> => {
      directory = sourceDirectory;
      expect(
        JSON.parse(await readFile(join(directory, "render.json"), "utf8")),
      ).toEqual({ format: "preview-pdf" });
      expect(
        JSON.parse(await readFile(join(directory, "preview.json"), "utf8")),
      ).toEqual(request);
      return use(
        {
          sourceFile: join(directory, "fixture"),
          sizeBytes: 5,
          sha256: "a".repeat(64),
        },
        new AbortController().signal,
      );
    },
  };
  const primary = new Error("consumer failed");
  await assert.rejects(
    withPreviewPdfFile(request, files, async () => {
      throw primary;
    }),
    (error: unknown) => error === primary,
  );
  expect(await Bun.file(join(directory, "preview.json")).exists()).toBe(true);
  const value = { id: "acknowledged" };
  const late = new AbortController();
  expect(
    await withPreviewPdfFile(
      request,
      files,
      async () => {
        late.abort(new Error("late cancellation"));
        expect(await Bun.file(join(directory, "preview.json")).exists()).toBe(
          true,
        );
        return value;
      },
      { signal: late.signal },
    ),
  ).toBe(value);
  expect(await Bun.file(join(directory, "preview.json")).exists()).toBe(false);
  expect(
    previewPdfRequestSchema.parse({ url: "https://example.test/preview" }),
  ).toEqual({
    url: "https://example.test/preview",
    maxBytes: 25 * 1024 * 1024,
    timeoutMs: 60_000,
  });
});
