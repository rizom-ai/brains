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
    expect(html).toContain("deck-carousel-header");
    expect(html).toContain("deck-carousel-body");
    expect(html).toContain("deck-carousel-counter");
    expect(html).toContain("--carousel-surface");
    expect(html).toContain("--color-accent");
  });

  it("renders a zero-padded counter per slide showing current and total", () => {
    const html = renderMediaTemplateHtml({
      template: deckCarouselTemplate,
      format: "pdf",
      content: {
        title: "Multi",
        slides: [{ markdown: "# A" }, { markdown: "# B" }, { markdown: "# C" }],
      },
      siteConfig: { title: "Multi", themeMode: "dark" },
    });

    const counters = html.match(/class="deck-carousel-counter[^-]/g) ?? [];
    expect(counters.length).toBe(3);
    // Current-slide highlight runs once per slide.
    const current = html.match(/class="deck-carousel-counter-current"/g) ?? [];
    expect(current.length).toBe(3);
    // Zero-padded numerals so "1/3" reads as "01 / 03".
    expect(html).toContain(">01<");
    expect(html).toContain(">02<");
    expect(html).toContain(">03<");
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

  it("splits a brandLabel containing a dot into masthead parts", () => {
    const html = renderMediaTemplateHtml({
      template: deckCarouselTemplate,
      format: "pdf",
      content: {
        title: "Sample Deck",
        brandLabel: "rizom.ai",
        slides: [{ markdown: "# Hi" }],
      },
      siteConfig: { title: "Sample Deck", themeMode: "dark" },
    });

    expect(html).toContain('aria-label="rizom.ai"');
    expect(html).toContain('<span class="wm-primary">rizom</span>');
    expect(html).toContain('<span class="wm-dot">.</span>');
    expect(html).toContain('<span class="wm-secondary">ai</span>');
  });

  it("splits a two-word brand into first.last lowercased", () => {
    const html = renderMediaTemplateHtml({
      template: deckCarouselTemplate,
      format: "pdf",
      content: {
        title: "Sample Deck",
        brandLabel: "Alex Chen",
        slides: [{ markdown: "# Hi" }],
      },
      siteConfig: { title: "Sample Deck", themeMode: "dark" },
    });

    expect(html).toContain('aria-label="Alex Chen"');
    expect(html).toContain('<span class="wm-primary">alex</span>');
    expect(html).toContain('<span class="wm-dot">.</span>');
    expect(html).toContain('<span class="wm-secondary">chen</span>');
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

    expect(html).toContain('aria-label="Deck Without Brand"');
    expect(html).toContain('<span class="wm-primary">deck</span>');
    expect(html).toContain('<span class="wm-secondary">without brand</span>');
  });

  it("renders the deck title in the footer meta by default", () => {
    const html = renderMediaTemplateHtml({
      template: deckCarouselTemplate,
      format: "pdf",
      content: {
        title: "Distributed Systems",
        slides: [{ markdown: "# Hi" }],
      },
      siteConfig: { title: "Distributed Systems", themeMode: "dark" },
    });

    expect(html).toContain(
      'class="deck-carousel-footer-meta">Distributed Systems',
    );
  });

  it("overrides the footer meta with eyebrow when present", () => {
    const html = renderMediaTemplateHtml({
      template: deckCarouselTemplate,
      format: "pdf",
      content: {
        title: "Sample Deck",
        eyebrow: "React Summit 2026",
        slides: [{ markdown: "# Hi" }],
      },
      siteConfig: { title: "Sample Deck", themeMode: "dark" },
    });

    expect(html).toContain(
      'class="deck-carousel-footer-meta">React Summit 2026',
    );
    expect(html).not.toContain('class="deck-carousel-footer-meta">Sample Deck');
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

  it("styles italic emphasis with the carousel accent color", () => {
    const html = renderMediaTemplateHtml({
      template: deckCarouselTemplate,
      format: "pdf",
      content: {
        title: "Accent",
        slides: [{ markdown: "This is *important*." }],
      },
      siteConfig: { title: "Accent", themeMode: "dark" },
    });

    expect(html).toContain("<em>important</em>");
    expect(html).toContain(".deck-carousel-content em");
    expect(html).toContain("color: var(--carousel-accent);");
  });

  it("uses opaque slide backgrounds for LinkedIn PDF compatibility", () => {
    const html = renderMediaTemplateHtml({
      template: deckCarouselTemplate,
      format: "pdf",
      content: {
        title: "Opaque",
        slides: [{ markdown: "# Hi" }],
      },
      siteConfig: { title: "Opaque", themeMode: "dark" },
    });

    expect(html).toContain("background-color: var(--carousel-surface);");
    expect(html).toContain("background-image: linear-gradient(");
    expect(html).not.toContain("radial-gradient(");
    expect(html).not.toContain(", transparent");
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
