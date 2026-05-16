import type { JSX } from "preact";
import { useMarkdownToHtml } from "@brains/ui-library";
import { z } from "@brains/utils";
import type { SiteViewTemplate } from "./site-view-template";

export const LINKEDIN_CAROUSEL_TEMPLATE_NAME = "site-builder:linkedin-carousel";

export const linkedinCarouselSlideSchema = z.object({
  markdown: z.string().min(1),
});

export const linkedinCarouselTemplateSchema = z.object({
  title: z.string().min(1),
  slides: z.array(linkedinCarouselSlideSchema).min(1),
});

export type LinkedinCarouselTemplateData = z.infer<
  typeof linkedinCarouselTemplateSchema
>;

export const linkedinCarouselTemplate: SiteViewTemplate = {
  name: LINKEDIN_CAROUSEL_TEMPLATE_NAME,
  pluginId: "site-builder",
  schema: linkedinCarouselTemplateSchema,
  renderers: {
    pdf: renderLinkedinCarouselPdf,
  },
};

function renderLinkedinCarouselPdf(
  props: Record<string, unknown>,
): JSX.Element {
  // The media-template pipeline parses content against `schema` before
  // invoking the renderer (see media-template-renderer.ts), but the slot
  // type is intentionally loose so the registry can hold heterogeneous
  // templates. Re-parse here to recover the typed shape locally — the cost
  // is one Zod parse per render call.
  const { title, slides } = linkedinCarouselTemplateSchema.parse(props);
  const toHtml = useMarkdownToHtml();

  return (
    <main className="linkedin-carousel-pdf" aria-label={title}>
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

            .linkedin-carousel-pdf {
              color: var(--color-text, #f5f5f5);
              font-family: var(--font-sans, system-ui, sans-serif);
              background: var(--color-bg, #0b0b0f);
            }

            .linkedin-carousel-slide {
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

            .linkedin-carousel-slide:last-child {
              page-break-after: auto;
              break-after: auto;
            }

            .linkedin-carousel-content {
              max-width: 100%;
            }

            .linkedin-carousel-content h1,
            .linkedin-carousel-content h2 {
              color: var(--color-heading, #ffffff);
              font-family: var(--font-heading, var(--font-sans, system-ui, sans-serif));
              font-size: 72px;
              line-height: 0.98;
              letter-spacing: -0.04em;
              margin: 0 0 40px;
              text-wrap: balance;
            }

            .linkedin-carousel-content h3 {
              color: var(--color-heading, #ffffff);
              font-size: 48px;
              line-height: 1.05;
              margin: 0 0 32px;
              text-wrap: balance;
            }

            .linkedin-carousel-content p,
            .linkedin-carousel-content li {
              color: var(--color-text, #f5f5f5);
              font-size: 36px;
              line-height: 1.22;
            }

            .linkedin-carousel-content p {
              margin: 0 0 28px;
            }

            .linkedin-carousel-content ul,
            .linkedin-carousel-content ol {
              margin: 28px 0 0;
              padding-left: 44px;
            }

            .linkedin-carousel-footer {
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
        <section className="linkedin-carousel-slide" key={index}>
          <div
            className="linkedin-carousel-content"
            dangerouslySetInnerHTML={{ __html: toHtml(slide.markdown) }}
          />
          <footer className="linkedin-carousel-footer">
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
