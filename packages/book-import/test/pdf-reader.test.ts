import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPdfReader } from "../src/pdf-reader";

describe("createPdfReader", () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), "pdf-cache-"));
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("reads a PDF's text layer and each page's head once, keeping both for the next import", async () => {
    const fetched: string[] = [];
    const commands: string[] = [];
    const reader = (): ReturnType<typeof createPdfReader> =>
      createPdfReader({
        cacheDir,
        fetchBytes: async (url) => {
          fetched.push(url);
          return new TextEncoder().encode("%PDF");
        },
        run: async (command, input) => {
          commands.push(command[0] ?? "");
          if (command[0] === "pdftohtml") {
            return new TextEncoder().encode(
              `<pdf2xml><page number="${command[command.indexOf("-f") + 1]}"></page></pdf2xml>`,
            );
          }
          if (command[0] === "pdftoppm") {
            return new TextEncoder().encode(
              `image of ${command[command.indexOf("-f") + 1]}`,
            );
          }
          return new TextEncoder().encode(
            `${new TextDecoder().decode(input)} head\nbody line\n`,
          );
        },
      });

    const first = await reader()(
      "https://example.org/mew_band30.pdf",
      415,
      416,
    );
    const again = await reader()(
      "https://example.org/mew_band30.pdf",
      415,
      416,
    );

    expect(first.xml).toContain('<page number="415">');
    expect([...first.heads]).toEqual([
      [415, "image of 415 head"],
      [416, "image of 416 head"],
    ]);
    expect(again).toEqual(first);
    expect(fetched).toEqual(["https://example.org/mew_band30.pdf"]);
    expect(commands.filter((command) => command === "tesseract")).toHaveLength(
      2,
    );
    expect(commands.filter((command) => command === "pdftohtml")).toHaveLength(
      1,
    );
  });
});
