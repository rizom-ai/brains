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
    expect(html).toContain("deck-carousel-slide");
    expect(html).toContain("deck-carousel-frame");
    expect(html).toContain("deck-carousel-accent");
    expect(html).toContain("--carousel-surface");
    expect(html).toContain("--color-accent");
  });

  it("renders one progress dot per slide and marks the current slide active", () => {
    const html = renderMediaTemplateHtml({
      template: deckCarouselTemplate,
      format: "pdf",
      content: {
        title: "Multi",
        slides: [{ markdown: "# A" }, { markdown: "# B" }, { markdown: "# C" }],
      },
      siteConfig: { title: "Multi", themeMode: "dark" },
    });

    // Three slides → three dots per slide × three slides = nine dot spans.
    const dots = html.match(/class="deck-carousel-dot/g) ?? [];
    expect(dots.length).toBe(9);
    // Each slide marks exactly one dot active.
    const active = html.match(/class="deck-carousel-dot is-active"/g) ?? [];
    expect(active.length).toBe(3);
    // Plain "1 / N" text is gone in favor of dots.
    expect(html).not.toContain(" / 3");
  });

  it("flags the first slide as the cover so it can receive distinct styling", () => {
    const html = renderMediaTemplateHtml({
      template: deckCarouselTemplate,
      format: "pdf",
      content: {
        title: "Cover Test",
        slides: [{ markdown: "# Cover" }, { markdown: "# Body" }],
      },
      siteConfig: { title: "Cover Test", themeMode: "dark" },
    });

    expect(html).toContain("deck-carousel-slide is-cover");
  });

  it("renders the brand wordmark from brandLabel in the footer", () => {
    const html = renderMediaTemplateHtml({
      template: deckCarouselTemplate,
      format: "pdf",
      content: {
        title: "Sample Deck",
        brandLabel: "Acme Corp",
        slides: [{ markdown: "# Hi" }],
      },
      siteConfig: { title: "Sample Deck", themeMode: "dark" },
    });

    expect(html).toContain('class="deck-carousel-wordmark"');
    expect(html).toContain("Acme Corp");
    // Brand label takes the wordmark slot; deck title still appears in the
    // slide body / aria-label, but is no longer the footer label.
    const wordmarkSection = html.match(
      /<span class="deck-carousel-wordmark">([^<]+)<\/span>/,
    );
    expect(wordmarkSection?.[1]).toBe("Acme Corp");
  });

  it("falls back to deck title when brandLabel is not provided", () => {
    const html = renderMediaTemplateHtml({
      template: deckCarouselTemplate,
      format: "pdf",
      content: {
        title: "Deck Without Brand",
        slides: [{ markdown: "# Hi" }],
      },
      siteConfig: { title: "Deck Without Brand", themeMode: "dark" },
    });

    const wordmarkSection = html.match(
      /<span class="deck-carousel-wordmark">([^<]+)<\/span>/,
    );
    expect(wordmarkSection?.[1]).toBe("Deck Without Brand");
  });

  it("ships both dark and light palettes scoped under [data-theme]", () => {
    const html = renderMediaTemplateHtml({
      template: deckCarouselTemplate,
      format: "pdf",
      content: {
        title: "Modes",
        slides: [{ markdown: "# Hi" }],
      },
      siteConfig: { title: "Modes", themeMode: "dark" },
    });

    expect(html).toContain('[data-theme="dark"] .deck-carousel-pdf');
    expect(html).toContain('[data-theme="light"] .deck-carousel-pdf');
  });

  it('emits data-theme="light" on <html> when siteConfig.themeMode is light', () => {
    const html = renderMediaTemplateHtml({
      template: deckCarouselTemplate,
      format: "pdf",
      content: {
        title: "Light",
        slides: [{ markdown: "# Hi" }],
      },
      siteConfig: { title: "Light", themeMode: "light" },
    });

    expect(html).toContain('data-theme="light"');
  });
});
