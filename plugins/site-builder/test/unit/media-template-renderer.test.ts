import { describe, expect, it } from "bun:test";
import { h, type JSX } from "preact";
import { z } from "@brains/utils";
import type { SiteViewTemplate } from "../../src/lib/site-view-template";
import { renderMediaTemplateHtml } from "../../src/lib/media-template-renderer";

function PdfComponent(props: Record<string, unknown>): JSX.Element {
  return h("main", { className: "pdf-slide" }, String(props["title"]));
}

function createTemplate(): SiteViewTemplate {
  return {
    name: "carousel-template",
    pluginId: "test",
    schema: z.object({ title: z.string() }),
    renderers: {
      pdf: PdfComponent,
    },
  };
}

describe("renderMediaTemplateHtml", () => {
  it("renders a pdf renderer into a noindex HTML shell", () => {
    const html = renderMediaTemplateHtml({
      template: createTemplate(),
      format: "pdf",
      content: { title: "Carousel" },
      siteConfig: { title: "Test Site", themeMode: "dark" },
    });

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Carousel");
    expect(html).toContain('class="pdf-slide"');
    expect(html).toContain('<meta name="robots" content="noindex,nofollow">');
    expect(html).toContain('<link rel="stylesheet" href="/styles/main.css">');
  });

  it("validates content with the template schema", () => {
    expect(() =>
      renderMediaTemplateHtml({
        template: createTemplate(),
        format: "pdf",
        content: { title: 123 },
        siteConfig: { title: "Test Site" },
      }),
    ).toThrow();
  });

  it("rejects templates without the requested media renderer", () => {
    expect(() =>
      renderMediaTemplateHtml({
        template: createTemplate(),
        format: "image",
        content: { title: "Carousel" },
        siteConfig: { title: "Test Site" },
      }),
    ).toThrow("No image renderer for template: carousel-template");
  });
});
