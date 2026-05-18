import { describe, expect, it } from "bun:test";
import { renderMediaTemplateHtml } from "@brains/media-page-composer";
import { deckCarouselTemplate } from "../../src/attachments/carousel-template";

describe("deck carousel template", () => {
  it("renders slide content into the media page HTML", () => {
    const html = renderMediaTemplateHtml({
      template: deckCarouselTemplate,
      format: "pdf",
      content: {
        title: "Sample Deck",
        slides: [{ markdown: "# Hello Carousel" }],
      },
      siteConfig: { title: "Sample Deck", themeMode: "dark" },
    });

    expect(html).toContain("Hello Carousel");
    expect(html).toContain("1 / 1");
    expect(html).toContain("deck-carousel-slide");
    expect(html).toContain("deck-carousel-frame");
    expect(html).toContain("deck-carousel-accent");
    expect(html).toContain("--carousel-surface");
    expect(html).toContain("--color-accent");
  });
});
