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
  const { title, slides } = deckCarouselTemplateSchema.parse(props);
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
              background: var(--color-bg, #0b0b0f);
            }

            .deck-carousel-pdf {
              --carousel-surface: var(--color-bg, #0b0b0f);
              --carousel-surface-strong: var(--color-bg-subtle, #14112b);
              --carousel-ink: var(--color-text, #f5f5f5);
              --carousel-heading: var(--color-heading, #ffffff);
              --carousel-muted: var(--color-text-muted, #a3a3a3);
              --carousel-accent: var(--color-accent, var(--color-brand, #ff8b3d));
              color: var(--carousel-ink);
              font-family: var(--font-sans, system-ui, sans-serif);
              background: var(--carousel-surface);
            }

            .deck-carousel-slide {
              box-sizing: border-box;
              position: relative;
              width: 1080px;
              height: 1350px;
              page-break-after: always;
              break-after: page;
              display: grid;
              grid-template-rows: 1fr auto;
              align-items: center;
              padding: 104px 108px 88px;
              background:
                radial-gradient(circle at 88% 12%, color-mix(in srgb, var(--carousel-accent) 20%, transparent), transparent 30%),
                linear-gradient(180deg, var(--carousel-surface-strong) 0%, var(--carousel-surface) 100%);
              overflow: hidden;
            }

            .deck-carousel-slide.is-cover {
              background:
                radial-gradient(circle at 12% 18%, color-mix(in srgb, var(--carousel-accent) 28%, transparent), transparent 38%),
                radial-gradient(circle at 92% 88%, color-mix(in srgb, var(--carousel-accent) 14%, transparent), transparent 36%),
                linear-gradient(160deg, var(--carousel-surface-strong) 0%, var(--carousel-surface) 100%);
            }

            .deck-carousel-slide::before {
              content: "";
              position: absolute;
              inset: 0;
              background-image:
                linear-gradient(90deg, color-mix(in srgb, var(--carousel-ink) 7%, transparent) 1px, transparent 1px),
                linear-gradient(180deg, color-mix(in srgb, var(--carousel-ink) 7%, transparent) 1px, transparent 1px);
              background-size: 72px 72px;
              mask-image: linear-gradient(135deg, transparent 0%, black 18%, transparent 58%);
              opacity: 0.22;
              pointer-events: none;
            }

            .deck-carousel-slide:last-child {
              page-break-after: auto;
              break-after: auto;
            }

            .deck-carousel-frame {
              position: relative;
              z-index: 1;
              max-width: 864px;
            }

            .deck-carousel-accent {
              width: 104px;
              height: 9px;
              margin: 0 0 48px;
              border-radius: 999px;
              background: var(--carousel-accent);
              box-shadow: 0 0 42px color-mix(in srgb, var(--carousel-accent) 45%, transparent);
            }

            .deck-carousel-slide.is-cover .deck-carousel-accent {
              width: 168px;
              height: 12px;
              margin-bottom: 60px;
            }

            .deck-carousel-content {
              max-width: 100%;
            }

            .deck-carousel-content h1,
            .deck-carousel-content h2 {
              color: var(--carousel-heading);
              font-family: var(--font-heading, var(--font-sans, system-ui, sans-serif));
              font-size: 78px;
              line-height: 0.96;
              letter-spacing: -0.045em;
              margin: 0 0 42px;
              text-wrap: balance;
            }

            .deck-carousel-slide:first-of-type .deck-carousel-content h1 {
              font-size: 84px;
              max-width: 820px;
            }

            .deck-carousel-content h3 {
              color: var(--carousel-heading);
              font-size: 52px;
              line-height: 1.04;
              margin: 0 0 34px;
              text-wrap: balance;
            }

            .deck-carousel-content p,
            .deck-carousel-content li {
              color: var(--carousel-ink);
              font-size: 34px;
              line-height: 1.24;
            }

            .deck-carousel-content p {
              margin: 0 0 30px;
            }

            .deck-carousel-content ul,
            .deck-carousel-content ol {
              list-style: none;
              margin: 30px 0 0;
              padding: 0;
            }

            .deck-carousel-content li {
              position: relative;
              margin: 0 0 18px;
              padding-left: 46px;
            }

            .deck-carousel-content ul > li::before {
              content: "";
              position: absolute;
              left: 0;
              top: 0.42em;
              width: 16px;
              height: 16px;
              border-radius: 4px;
              background: var(--carousel-accent);
              box-shadow: 0 0 18px color-mix(in srgb, var(--carousel-accent) 50%, transparent);
            }

            .deck-carousel-content ol {
              counter-reset: deck-carousel-ol;
            }

            .deck-carousel-content ol > li {
              counter-increment: deck-carousel-ol;
            }

            .deck-carousel-content ol > li::before {
              content: counter(deck-carousel-ol);
              position: absolute;
              left: 0;
              top: 0.05em;
              color: var(--carousel-accent);
              font-weight: 700;
              font-size: 30px;
              line-height: 1;
            }

            .deck-carousel-content strong {
              color: var(--carousel-heading);
              font-weight: 700;
            }

            .deck-carousel-footer {
              position: relative;
              z-index: 1;
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 48px;
              padding-top: 28px;
              border-top: 1px solid color-mix(in srgb, var(--carousel-ink) 16%, transparent);
              color: var(--carousel-muted);
              font-size: 23px;
              line-height: 1.3;
            }

            .deck-carousel-progress {
              display: inline-flex;
              gap: 10px;
              align-items: center;
            }

            .deck-carousel-dot {
              display: inline-block;
              width: 10px;
              height: 10px;
              border-radius: 999px;
              background: color-mix(in srgb, var(--carousel-ink) 22%, transparent);
            }

            .deck-carousel-dot.is-active {
              background: var(--carousel-accent);
              box-shadow: 0 0 14px color-mix(in srgb, var(--carousel-accent) 55%, transparent);
            }
          `,
        }}
      />
      {slides.map((slide, index) => (
        <section
          className={`deck-carousel-slide${index === 0 ? " is-cover" : ""}`}
          key={index}
        >
          <div className="deck-carousel-frame">
            <div className="deck-carousel-accent" />
            <div
              className="deck-carousel-content"
              dangerouslySetInnerHTML={{ __html: toHtml(slide.markdown) }}
            />
          </div>
          <footer className="deck-carousel-footer">
            <span>{title}</span>
            <span
              className="deck-carousel-progress"
              aria-label={`Slide ${index + 1} of ${slides.length}`}
            >
              {slides.map((_, dotIndex) => (
                <span
                  key={dotIndex}
                  className={`deck-carousel-dot${dotIndex === index ? " is-active" : ""}`}
                />
              ))}
            </span>
          </footer>
        </section>
      ))}
    </main>
  );
}
