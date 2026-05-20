import type { JSX } from "preact";
import { useMarkdownToHtml } from "@brains/ui-library";
import { z } from "@brains/utils";
import type { MediaPageTemplate } from "@brains/media-page-composer";

export const DECK_CAROUSEL_ATTACHMENT_TYPE = "carousel";
export const DECK_CAROUSEL_TEMPLATE_NAME = "decks:carousel";

export const deckCarouselSlideSchema = z.object({
  markdown: z.string().min(1),
});

export const deckCarouselTemplateSchema = z.object({
  title: z.string().min(1),
  brandLabel: z.string().min(1).optional(),
  slides: z.array(deckCarouselSlideSchema).min(1),
});

export type DeckCarouselTemplateData = z.infer<
  typeof deckCarouselTemplateSchema
>;

export const deckCarouselTemplate: MediaPageTemplate = {
  name: DECK_CAROUSEL_TEMPLATE_NAME,
  pluginId: "decks",
  schema: deckCarouselTemplateSchema,
  renderers: {
    pdf: renderDeckCarouselPdf,
  },
};

function renderDeckCarouselPdf(props: Record<string, unknown>): JSX.Element {
  const { title, brandLabel, slides } = deckCarouselTemplateSchema.parse(props);
  const wordmark = brandLabel ?? title;
  const total = slides.length;
  const totalLabel = String(total).padStart(2, "0");
  const toHtml = useMarkdownToHtml();

  return (
    <main className="deck-carousel-pdf" aria-label={title}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @page {
              size: 1080px 1350px;
              margin: 0;
            }

            html,
            body {
              margin: 0;
              padding: 0;
            }

            .deck-carousel-pdf {
              color: var(--carousel-ink);
              font-family: var(--font-sans, -apple-system, "Helvetica Neue", system-ui, sans-serif);
              background: var(--carousel-surface);
            }

            [data-theme="dark"] .deck-carousel-pdf {
              --carousel-surface: var(--color-bg, #0c0c10);
              --carousel-ink: var(--color-text, #f0ede5);
              --carousel-heading: var(--color-heading, var(--carousel-ink));
              --carousel-ink-muted: color-mix(in srgb, var(--carousel-ink) 45%, transparent);
              --carousel-divider: color-mix(in srgb, var(--carousel-ink) 12%, transparent);
              --carousel-accent: var(--color-accent, var(--color-brand, #ff8b3d));
              --carousel-body-line-height: 1.32;
            }

            [data-theme="light"] .deck-carousel-pdf {
              --carousel-surface: var(--color-bg, #f4ede0);
              --carousel-ink: var(--color-text, #15171a);
              --carousel-heading: var(--color-heading, var(--carousel-ink));
              --carousel-ink-muted: color-mix(in srgb, var(--carousel-ink) 55%, transparent);
              --carousel-divider: color-mix(in srgb, var(--carousel-ink) 18%, transparent);
              --carousel-accent: var(--color-accent, var(--color-brand, #d36420));
              --carousel-body-line-height: 1.28;
            }

            .deck-carousel-slide {
              box-sizing: border-box;
              position: relative;
              width: 1080px;
              height: 1350px;
              page-break-after: always;
              break-after: page;
              display: grid;
              grid-template-rows: auto 1fr auto;
              padding: 88px 108px;
              background: var(--carousel-surface);
            }

            .deck-carousel-slide:last-child {
              page-break-after: auto;
              break-after: auto;
            }

            .deck-carousel-header {
              display: flex;
              align-items: center;
            }

            .deck-carousel-wordmark {
              font-family: var(--font-heading, var(--font-sans, system-ui, sans-serif));
              font-weight: 600;
              font-size: 44px;
              letter-spacing: -0.02em;
              color: var(--carousel-heading);
            }

            .deck-carousel-body {
              display: flex;
              align-items: center;
              padding: 64px 0;
            }

            .deck-carousel-content {
              max-width: 100%;
            }

            .deck-carousel-content h1,
            .deck-carousel-content h2,
            .deck-carousel-content h3 {
              color: var(--carousel-heading);
              font-family: var(--font-heading, var(--font-sans, system-ui, sans-serif));
              font-weight: 700;
              letter-spacing: -0.035em;
              text-wrap: balance;
              margin: 0 0 36px;
            }

            .deck-carousel-content h1,
            .deck-carousel-content h2 {
              font-size: 76px;
              line-height: 1.0;
            }

            .deck-carousel-content h3 {
              font-size: 50px;
              line-height: 1.05;
            }

            .deck-carousel-slide.is-cover .deck-carousel-content h1,
            .deck-carousel-slide.is-cover .deck-carousel-content h2 {
              font-size: 110px;
              line-height: 0.96;
              letter-spacing: -0.045em;
            }

            .deck-carousel-content p,
            .deck-carousel-content li {
              color: var(--carousel-ink);
              font-size: 32px;
              line-height: var(--carousel-body-line-height);
            }

            .deck-carousel-content p {
              margin: 0 0 28px;
            }

            .deck-carousel-content ul,
            .deck-carousel-content ol {
              list-style: none;
              margin: 24px 0 0;
              padding: 0;
            }

            .deck-carousel-content li {
              position: relative;
              margin: 0 0 22px;
              padding-left: 44px;
            }

            .deck-carousel-content ul > li::before {
              content: "—";
              position: absolute;
              left: 0;
              top: 0;
              color: var(--carousel-accent);
              font-weight: 700;
              line-height: var(--carousel-body-line-height);
            }

            .deck-carousel-content ol {
              counter-reset: deck-carousel-ol;
            }

            .deck-carousel-content ol > li {
              counter-increment: deck-carousel-ol;
            }

            .deck-carousel-content ol > li::before {
              content: counter(deck-carousel-ol, decimal-leading-zero) ".";
              position: absolute;
              left: 0;
              top: 0;
              color: var(--carousel-accent);
              font-weight: 700;
              font-variant-numeric: tabular-nums;
              line-height: var(--carousel-body-line-height);
            }

            .deck-carousel-content strong {
              color: var(--carousel-heading);
              font-weight: 700;
            }

            .deck-carousel-footer {
              display: flex;
              align-items: center;
              justify-content: flex-end;
              padding-top: 24px;
              border-top: 1px solid var(--carousel-divider);
            }

            .deck-carousel-counter {
              font-family: var(--font-heading, var(--font-sans, system-ui, sans-serif));
              font-size: 26px;
              letter-spacing: 0.04em;
              color: var(--carousel-ink-muted);
              font-variant-numeric: tabular-nums;
            }

            .deck-carousel-counter-current {
              color: var(--carousel-accent);
              font-weight: 700;
            }
          `,
        }}
      />
      {slides.map((slide, index) => (
        <section
          className={`deck-carousel-slide${index === 0 ? " is-cover" : ""}`}
          key={index}
        >
          <header className="deck-carousel-header">
            <span className="deck-carousel-wordmark">{wordmark}</span>
          </header>
          <div className="deck-carousel-body">
            <div
              className="deck-carousel-content"
              dangerouslySetInnerHTML={{ __html: toHtml(slide.markdown) }}
            />
          </div>
          <footer className="deck-carousel-footer">
            <span
              className="deck-carousel-counter"
              aria-label={`Slide ${index + 1} of ${total}`}
            >
              <span className="deck-carousel-counter-current">
                {String(index + 1).padStart(2, "0")}
              </span>
              {" / "}
              <span>{totalLabel}</span>
            </span>
          </footer>
        </section>
      ))}
    </main>
  );
}
