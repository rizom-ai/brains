import { describe, expect, it } from "bun:test";
import { readdir } from "fs/promises";
import { tmpdir } from "os";
import { createElement as h, type JSX } from "react";
import { z } from "@brains/utils/zod";
import { getErrorMessage } from "@brains/utils/error";
import { renderPrintablePdf, type MediaPageTemplate } from "../src";

const TINY_PDF = Buffer.from("%PDF-1.7\n", "utf-8");

function PrintableDocument(props: Record<string, unknown>): JSX.Element {
  return h("article", { className: "printable" }, String(props["title"]));
}

function ImageCard(): JSX.Element {
  return h("div", null, "image renderer must not be used for pdf");
}

function createTemplate(): MediaPageTemplate {
  return {
    name: "printable-template",
    pluginId: "test",
    schema: z.object({ title: z.string() }),
    renderers: { pdf: PrintableDocument, image: ImageCard },
  };
}

async function countTempDirs(prefix: string): Promise<number> {
  const entries = await readdir(tmpdir());
  return entries.filter((entry) => entry.startsWith(prefix)).length;
}

describe("renderPrintablePdf", () => {
  it("renders a template to a PDF through the injected renderPdf fn", async () => {
    let capturedUrl = "";
    let capturedOptions: Record<string, unknown> | undefined;
    let renderedHtml = "";

    const pdf = await renderPrintablePdf({
      mediaPath: "/_media/printable/project/project-1",
      template: createTemplate(),
      content: { title: "Civic Signals" },
      title: "Civic Signals",
      themeMode: "light",
      themeCSS: "",
      tmpPrefix: "printable-render-",
      renderPdf: async (url, options) => {
        capturedUrl = url;
        capturedOptions = options as Record<string, unknown> | undefined;
        renderedHtml = await (await fetch(url)).text();
        return TINY_PDF;
      },
    });

    expect(pdf).toEqual(TINY_PDF);
    expect(capturedUrl).toContain("/_media/printable/project/project-1/");
    // Printables must honour the template's own @page CSS and backgrounds.
    expect(capturedOptions).toEqual({
      maxBytes: 25 * 1024 * 1024,
      timeoutMs: 60_000,
      printBackground: true,
      preferCSSPageSize: true,
    });
    // The "pdf" renderer is selected, not the "image" one.
    expect(renderedHtml).toContain("printable");
    expect(renderedHtml).toContain("Civic Signals");
    expect(renderedHtml).not.toContain("image renderer must not be used");
  });

  it("removes its temp directory after rendering", async () => {
    const prefix = "printable-cleanup-";
    const before = await countTempDirs(prefix);

    await renderPrintablePdf({
      mediaPath: "/_media/printable/project/project-1",
      template: createTemplate(),
      content: { title: "Civic Signals" },
      title: "Civic Signals",
      themeCSS: "",
      tmpPrefix: prefix,
      renderPdf: async () => TINY_PDF,
    });

    expect(await countTempDirs(prefix)).toBe(before);
  });

  it("cleans up its temp directory even when the pdf render fails", async () => {
    const prefix = "printable-fail-";
    const before = await countTempDirs(prefix);

    let error: unknown;
    try {
      await renderPrintablePdf({
        mediaPath: "/_media/printable/project/project-1",
        template: createTemplate(),
        content: { title: "Civic Signals" },
        title: "Civic Signals",
        themeCSS: "",
        tmpPrefix: prefix,
        renderPdf: async () => {
          throw new Error("pdf boom");
        },
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect(getErrorMessage(error)).toBe("pdf boom");
    expect(await countTempDirs(prefix)).toBe(before);
  });
});
