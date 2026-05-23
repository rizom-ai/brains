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
  eyebrow: z.string().min(1).optional(),
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

interface WordmarkParts {
  primary: string;
  secondary: string | undefined;
}

// Split a brand label into the editorial masthead pattern `<primary>.<secondary>`
// matching the rizom.ai wordmark. Prefers an existing dot ("rizom.ai"), falls back
// to first-space ("Alex Chen" → "alex.chen"), or single-part when neither.
function splitWordmark(label: string): WordmarkParts {
  const trimmed = label.trim();
  const dot = trimmed.lastIndexOf(".");
  if (dot > 0 && dot < trimmed.length - 1) {
    return {
      primary: trimmed.slice(0, dot).toLowerCase(),
      secondary: trimmed.slice(dot + 1).toLowerCase(),
    };
  }
  const space = trimmed.indexOf(" ");
  if (space > 0) {
    return {
      primary: trimmed.slice(0, space).toLowerCase(),
      secondary: trimmed.slice(space + 1).toLowerCase(),
    };
  }
  return { primary: trimmed.toLowerCase(), secondary: undefined };
}

function renderDeckCarouselPdf(props: Record<string, unknown>): JSX.Element {
  const { title, brandLabel, eyebrow, slides } =
    deckCarouselTemplateSchema.parse(props);
  const wordmark = splitWordmark(brandLabel ?? title);
  const total = slides.length;
  const totalLabel = String(total).padStart(2, "0");
  const toHtml = useMarkdownToHtml();

  return (
    <main className="deck-carousel-pdf" aria-label={title}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            /* Fonts ship inline so the PDF renderer doesn't fall through to
               heavy Linux system-ui. The site theme can override via
               --font-sans / --font-heading / --font-mono. */
            @import url("https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;1,9..144,400&family=IBM+Plex+Sans:ital,wght@0,300;0,400;0,500;1,400&family=JetBrains+Mono:wght@400;500&display=swap");

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
              font-family: var(--font-sans, "IBM Plex Sans", -apple-system, system-ui, sans-serif);
              font-weight: 400;
              background: var(--carousel-surface);
            }

            [data-theme="dark"] .deck-carousel-pdf {
              --carousel-surface: var(--color-bg, #0c0c10);
              --carousel-surface-deep: #050507;
              --carousel-surface-glow: #1a1530;
              --carousel-ink: var(--color-text, #f0ede5);
              --carousel-heading: var(--color-heading, #f7f3e6);
              --carousel-ink-muted: color-mix(in srgb, var(--carousel-ink) 50%, var(--carousel-surface));
              --carousel-divider: color-mix(in srgb, var(--carousel-ink) 12%, var(--carousel-surface));
              --carousel-accent: var(--color-accent, var(--color-brand, #ff8b3d));
              --carousel-accent-soft: color-mix(in srgb, var(--carousel-accent) 22%, var(--carousel-surface));
              --carousel-glow-soft: color-mix(in srgb, var(--carousel-surface-glow) 55%, var(--carousel-surface));
              --carousel-body-line-height: 1.3;
            }

            [data-theme="light"] .deck-carousel-pdf {
              --carousel-surface: var(--color-bg, #f4ede0);
              --carousel-surface-deep: #ebe2d0;
              --carousel-surface-glow: #fbf6ea;
              --carousel-ink: var(--color-text, #15171a);
              --carousel-heading: var(--color-heading, #0a0c10);
              --carousel-ink-muted: color-mix(in srgb, var(--carousel-ink) 55%, var(--carousel-surface));
              --carousel-divider: color-mix(in srgb, var(--carousel-ink) 18%, var(--carousel-surface));
              --carousel-accent: var(--color-accent, var(--color-brand, #c5500e));
              --carousel-accent-soft: color-mix(in srgb, var(--carousel-accent) 14%, var(--carousel-surface));
              --carousel-glow-soft: color-mix(in srgb, var(--carousel-surface-glow) 70%, var(--carousel-surface));
              --carousel-body-line-height: 1.26;
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
              /* Keep the PDF background fully opaque. LinkedIn re-rasterizes
                 uploaded documents and can flatten transparent gradients
                 differently than local PDF viewers. */
              background-color: var(--carousel-surface);
              background-image: linear-gradient(
                165deg,
                var(--carousel-surface) 0%,
                var(--carousel-accent-soft) 26%,
                var(--carousel-glow-soft) 62%,
                var(--carousel-surface-deep) 100%
              );
            }

            .deck-carousel-slide.is-cover {
              background-color: var(--carousel-surface-deep);
              background-image: linear-gradient(
                155deg,
                var(--carousel-accent-soft) 0%,
                var(--carousel-surface-deep) 34%,
                var(--carousel-surface) 68%,
                var(--carousel-glow-soft) 100%
              );
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
              display: inline-flex;
              align-items: baseline;
              font-family: var(--font-heading, "Fraunces", "IBM Plex Sans", serif);
              font-weight: 500;
              font-size: 48px;
              letter-spacing: -0.02em;
              line-height: 1;
              font-variation-settings: "opsz" 24;
            }
            .deck-carousel-wordmark .wm-primary {
              color: var(--carousel-heading);
            }
            .deck-carousel-wordmark .wm-dot {
              color: var(--carousel-accent);
            }
            .deck-carousel-wordmark .wm-secondary {
              color: var(--carousel-ink-muted);
              font-style: italic;
              font-weight: 400;
            }

            .deck-carousel-body {
              display: flex;
              align-items: center;
              padding: 56px 0;
            }
            .deck-carousel-content {
              max-width: 100%;
            }

            .deck-carousel-content h1,
            .deck-carousel-content h2,
            .deck-carousel-content h3 {
              color: var(--carousel-heading);
              font-family: var(--font-heading, "Fraunces", "IBM Plex Sans", serif);
              font-weight: 600;
              letter-spacing: -0.025em;
              text-wrap: balance;
              margin: 0 0 36px;
            }
            .deck-carousel-content h1,
            .deck-carousel-content h2 {
              font-size: 82px;
              line-height: 1;
            }
            .deck-carousel-content h3 {
              font-size: 54px;
              line-height: 1.06;
            }
            .deck-carousel-slide.is-cover .deck-carousel-content h1,
            .deck-carousel-slide.is-cover .deck-carousel-content h2 {
              font-size: 118px;
              line-height: 0.94;
              letter-spacing: -0.035em;
              max-width: 880px;
            }

            .deck-carousel-content p,
            .deck-carousel-content li {
              color: var(--carousel-ink);
              font-weight: 400;
              font-size: 32px;
              line-height: var(--carousel-body-line-height);
            }
            .deck-carousel-content p {
              margin: 0 0 26px;
            }
            .deck-carousel-content ul,
            .deck-carousel-content ol {
              list-style: none;
              margin: 28px 0 0;
              padding: 0;
            }
            .deck-carousel-content li {
              position: relative;
              padding-left: 56px;
              margin: 0 0 22px;
            }
            .deck-carousel-content ul > li::before {
              content: "";
              position: absolute;
              left: 0;
              top: 0.62em;
              width: 28px;
              height: 2px;
              background: var(--carousel-accent);
            }
            .deck-carousel-content ol {
              counter-reset: deck-ol;
            }
            .deck-carousel-content ol > li {
              counter-increment: deck-ol;
            }
            .deck-carousel-content ol > li::before {
              content: counter(deck-ol, decimal-leading-zero);
              position: absolute;
              left: 0;
              top: 0;
              color: var(--carousel-accent);
              font-family: var(--font-mono, "JetBrains Mono", ui-monospace, monospace);
              font-weight: 500;
              font-size: 26px;
              font-variant-numeric: tabular-nums;
              line-height: var(--carousel-body-line-height);
            }
            .deck-carousel-content strong {
              color: var(--carousel-heading);
              font-weight: 600;
            }
            .deck-carousel-content em {
              font-family: var(--font-heading, "Fraunces", "IBM Plex Sans", serif);
              font-style: italic;
              color: var(--carousel-heading);
            }

            .deck-carousel-footer {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding-top: 22px;
              border-top: 1px solid var(--carousel-divider);
            }
            .deck-carousel-footer-meta {
              font-family: var(--font-mono, "JetBrains Mono", ui-monospace, monospace);
              font-size: 22px;
              letter-spacing: 0.08em;
              text-transform: uppercase;
              color: var(--carousel-ink-muted);
            }
            .deck-carousel-counter {
              font-family: var(--font-mono, "JetBrains Mono", ui-monospace, monospace);
              font-size: 22px;
              letter-spacing: 0.06em;
              color: var(--carousel-ink-muted);
              font-variant-numeric: tabular-nums;
              margin-left: auto;
            }
            .deck-carousel-counter-current {
              color: var(--carousel-accent);
              font-weight: 600;
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
            <span
              className="deck-carousel-wordmark"
              aria-label={brandLabel ?? title}
            >
              <span className="wm-primary">{wordmark.primary}</span>
              {wordmark.secondary !== undefined && (
                <>
                  <span className="wm-dot">.</span>
                  <span className="wm-secondary">{wordmark.secondary}</span>
                </>
              )}
            </span>
          </header>
          <div className="deck-carousel-body">
            <div
              className="deck-carousel-content"
              dangerouslySetInnerHTML={{ __html: toHtml(slide.markdown) }}
            />
          </div>
          <footer className="deck-carousel-footer">
            <span className="deck-carousel-footer-meta">
              {eyebrow ?? title}
            </span>
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
