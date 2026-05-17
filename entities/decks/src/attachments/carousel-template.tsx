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
              color: var(--color-text, #f5f5f5);
              font-family: var(--font-sans, system-ui, sans-serif);
              background: var(--color-bg, #0b0b0f);
            }

            .deck-carousel-slide {
              box-sizing: border-box;
              width: 1080px;
              height: 1350px;
              page-break-after: always;
              break-after: page;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              padding: 96px;
              background: var(--color-bg-gradient, var(--color-bg, #0b0b0f));
              overflow: hidden;
            }

            .deck-carousel-slide:last-child {
              page-break-after: auto;
              break-after: auto;
            }

            .deck-carousel-content {
              max-width: 100%;
            }

            .deck-carousel-content h1,
            .deck-carousel-content h2 {
              color: var(--color-heading, #ffffff);
              font-family: var(--font-heading, var(--font-sans, system-ui, sans-serif));
              font-size: 72px;
              line-height: 0.98;
              letter-spacing: -0.04em;
              margin: 0 0 40px;
              text-wrap: balance;
            }

            .deck-carousel-content h3 {
              color: var(--color-heading, #ffffff);
              font-size: 48px;
              line-height: 1.05;
              margin: 0 0 32px;
              text-wrap: balance;
            }

            .deck-carousel-content p,
            .deck-carousel-content li {
              color: var(--color-text, #f5f5f5);
              font-size: 36px;
              line-height: 1.22;
            }

            .deck-carousel-content p {
              margin: 0 0 28px;
            }

            .deck-carousel-content ul,
            .deck-carousel-content ol {
              margin: 28px 0 0;
              padding-left: 44px;
            }

            .deck-carousel-footer {
              display: flex;
              justify-content: space-between;
              gap: 48px;
              color: var(--color-text-muted, #a3a3a3);
              font-size: 24px;
              line-height: 1.3;
            }
          `,
        }}
      />
      {slides.map((slide, index) => (
        <section className="deck-carousel-slide" key={index}>
          <div
            className="deck-carousel-content"
            dangerouslySetInnerHTML={{ __html: toHtml(slide.markdown) }}
          />
          <footer className="deck-carousel-footer">
            <span>{title}</span>
            <span>
              {index + 1} / {slides.length}
            </span>
          </footer>
        </section>
      ))}
    </main>
  );
}
