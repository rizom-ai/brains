import type { JSX } from "preact";
import { z } from "@brains/utils";
import type { MediaPageTemplate } from "@brains/media-page-composer";

export const DECK_OG_IMAGE_ATTACHMENT_TYPE = "og-image";
export const DECK_OG_IMAGE_TEMPLATE_NAME = "decks:og-image";

export const deckOgImageTemplateSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  event: z.string().optional(),
  brandLabel: z.string().optional(),
  slideCount: z.number().int().positive().optional(),
  coverImageUrl: z.string().optional(),
});

export type DeckOgImageTemplateData = z.infer<typeof deckOgImageTemplateSchema>;

export const deckOgImageTemplate: MediaPageTemplate = {
  name: DECK_OG_IMAGE_TEMPLATE_NAME,
  pluginId: "decks",
  schema: deckOgImageTemplateSchema,
  renderers: {
    image: renderDeckOgImage,
  },
};

function renderDeckOgImage(props: Record<string, unknown>): JSX.Element {
  const data = deckOgImageTemplateSchema.parse(props);
  const countLabel = data.slideCount
    ? `${data.slideCount} slide${data.slideCount === 1 ? "" : "s"}`
    : undefined;

  return (
    <main className="og-card">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @import url("https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,550;9..144,700&family=IBM+Plex+Sans:wght@450;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap");
            @page { size: 1200px 630px; margin: 0; }
            html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #0b0b10; }
            body { font-family: var(--font-sans, "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif); }
            .og-card {
              box-sizing: border-box;
              position: relative;
              width: 1200px;
              height: 630px;
              overflow: hidden;
              padding: 58px 66px;
              color: #f7f3e6;
              background:
                radial-gradient(circle at 76% 18%, rgba(255, 139, 61, 0.28), transparent 26%),
                radial-gradient(circle at 18% 84%, rgba(91, 80, 255, 0.2), transparent 28%),
                linear-gradient(135deg, #0b0b10 0%, #151424 54%, #09090d 100%);
            }
            .og-card::before {
              content: "";
              position: absolute;
              inset: 32px;
              border: 1px solid rgba(247, 243, 230, 0.18);
              pointer-events: none;
            }
            .og-card::after {
              content: "";
              position: absolute;
              left: 0;
              top: 0;
              bottom: 0;
              width: 9px;
              background: linear-gradient(#ff8b3d, #7c5cff);
            }
            .og-layout {
              position: relative;
              z-index: 1;
              display: grid;
              grid-template-columns: 1fr 374px;
              gap: 58px;
              height: 100%;
            }
            .og-content { display: flex; min-width: 0; flex-direction: column; justify-content: space-between; }
            .og-kicker {
              display: flex;
              align-items: center;
              gap: 14px;
              margin: 0;
              color: #ffb07a;
              font: 600 18px/1.2 var(--font-mono, "JetBrains Mono", ui-monospace, monospace);
              letter-spacing: 0.15em;
              text-transform: uppercase;
            }
            .og-kicker::before {
              content: "";
              width: 46px;
              height: 3px;
              background: linear-gradient(90deg, #ff8b3d, #7c5cff);
            }
            .og-title {
              max-width: 710px;
              margin: 34px 0 0;
              font-family: var(--font-heading, "Fraunces", Georgia, serif);
              font-size: 78px;
              font-weight: 700;
              line-height: 0.94;
              letter-spacing: -0.052em;
              text-wrap: balance;
            }
            .og-description {
              max-width: 690px;
              margin: 26px 0 0;
              color: rgba(247, 243, 230, 0.72);
              font-size: 27px;
              font-weight: 450;
              line-height: 1.24;
              text-wrap: balance;
            }
            .og-meta {
              display: flex;
              flex-wrap: wrap;
              gap: 12px 16px;
              color: rgba(247, 243, 230, 0.66);
              font: 600 18px/1.2 var(--font-mono, "JetBrains Mono", ui-monospace, monospace);
              letter-spacing: 0.1em;
              text-transform: uppercase;
            }
            .og-pill {
              padding: 9px 13px;
              border: 1px solid rgba(247, 243, 230, 0.22);
              background: rgba(247, 243, 230, 0.06);
            }
            .og-art {
              position: relative;
              align-self: stretch;
              min-height: 0;
              perspective: 900px;
            }
            .og-cover-frame {
              position: absolute;
              inset: 0;
              padding: 12px;
              border: 1px solid rgba(247, 243, 230, 0.2);
              background: rgba(8, 8, 12, 0.78);
              box-shadow: 18px 18px 0 rgba(255, 139, 61, 0.16), -14px -14px 0 rgba(124, 92, 255, 0.12);
            }
            .og-cover {
              display: block;
              width: 100%;
              height: 100%;
              object-fit: cover;
              filter: saturate(0.94) contrast(1.05);
            }
            .og-slide-stack {
              position: absolute;
              inset: 0;
              transform-style: preserve-3d;
            }
            .og-slide {
              position: absolute;
              width: 285px;
              height: 178px;
              border: 1px solid rgba(247, 243, 230, 0.2);
              background:
                linear-gradient(135deg, rgba(255, 139, 61, 0.18), transparent 44%),
                linear-gradient(160deg, rgba(247, 243, 230, 0.1), rgba(247, 243, 230, 0.03)),
                #12121b;
              box-shadow: 0 24px 70px rgba(0,0,0,0.35);
            }
            .og-slide.one { right: 52px; top: 40px; transform: rotate(-7deg); }
            .og-slide.two { right: 16px; top: 168px; transform: rotate(5deg); }
            .og-slide.three { right: 78px; bottom: 64px; transform: rotate(-2deg); }
            .og-slide::before {
              content: "";
              position: absolute;
              left: 28px;
              top: 32px;
              right: 28px;
              height: 18px;
              background: rgba(255, 139, 61, 0.82);
            }
            .og-slide::after {
              content: "";
              position: absolute;
              left: 28px;
              right: 72px;
              bottom: 42px;
              height: 10px;
              background: rgba(247, 243, 230, 0.52);
              box-shadow: 0 22px 0 rgba(247, 243, 230, 0.32);
            }
          `,
        }}
      />
      <section className="og-layout">
        <div className="og-content">
          <div>
            {data.brandLabel && <p className="og-kicker">{data.brandLabel}</p>}
            <h1 className="og-title">{data.title}</h1>
            {data.description && (
              <p className="og-description">{data.description}</p>
            )}
          </div>
          <div className="og-meta">
            <span className="og-pill">Deck</span>
            {countLabel && <span className="og-pill">{countLabel}</span>}
            {data.event && <span className="og-pill">{data.event}</span>}
          </div>
        </div>
        <aside className="og-art" aria-hidden="true">
          {data.coverImageUrl ? (
            <div className="og-cover-frame">
              <img className="og-cover" src={data.coverImageUrl} alt="" />
            </div>
          ) : (
            <div className="og-slide-stack">
              <span className="og-slide one" />
              <span className="og-slide two" />
              <span className="og-slide three" />
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
