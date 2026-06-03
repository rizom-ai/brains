import type { JSX } from "preact";
import { z } from "@brains/utils";
import type { MediaPageTemplate } from "@brains/media-page-composer";

export const PROJECT_OG_IMAGE_ATTACHMENT_TYPE = "og-image";
export const PROJECT_OG_IMAGE_TEMPLATE_NAME = "portfolio:og-image";

export const projectOgImageTemplateSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  year: z.number().optional(),
  brandLabel: z.string().optional(),
  coverImageUrl: z.string().optional(),
});

export type ProjectOgImageTemplateData = z.infer<
  typeof projectOgImageTemplateSchema
>;

export const projectOgImageTemplate: MediaPageTemplate = {
  name: PROJECT_OG_IMAGE_TEMPLATE_NAME,
  pluginId: "portfolio",
  schema: projectOgImageTemplateSchema,
  renderers: {
    image: renderProjectOgImage,
  },
};

function renderProjectOgImage(props: Record<string, unknown>): JSX.Element {
  const data = projectOgImageTemplateSchema.parse(props);

  return (
    <main className="og-card">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @import url("https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@450;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap");
            @page { size: 1200px 630px; margin: 0; }
            html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #0d1117; }
            body { font-family: var(--font-sans, "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif); }
            .og-card {
              box-sizing: border-box;
              position: relative;
              width: 1200px;
              height: 630px;
              overflow: hidden;
              padding: 62px 70px;
              color: #eef6ff;
              background:
                radial-gradient(circle at 84% 18%, rgba(54, 211, 153, 0.24), transparent 26%),
                radial-gradient(circle at 20% 85%, rgba(82, 148, 255, 0.18), transparent 28%),
                linear-gradient(135deg, #0d1117 0%, #111827 54%, #08111f 100%);
            }
            .og-grid {
              position: absolute;
              inset: 0;
              opacity: 0.24;
              background-image:
                linear-gradient(rgba(148, 163, 184, 0.14) 1px, transparent 1px),
                linear-gradient(90deg, rgba(148, 163, 184, 0.14) 1px, transparent 1px);
              background-size: 44px 44px;
              mask-image: linear-gradient(90deg, transparent, #000 14%, #000 78%, transparent);
            }
            .og-card::before {
              content: "";
              position: absolute;
              inset: 34px;
              border: 1px solid rgba(226, 232, 240, 0.18);
              pointer-events: none;
            }
            .og-layout {
              position: relative;
              z-index: 1;
              display: grid;
              grid-template-columns: 1fr 370px;
              gap: 58px;
              height: 100%;
            }
            .og-content { display: flex; min-width: 0; flex-direction: column; justify-content: space-between; }
            .og-kicker {
              display: flex;
              align-items: center;
              gap: 14px;
              margin: 0;
              color: #77f2c3;
              font: 600 18px/1.2 var(--font-mono, "JetBrains Mono", ui-monospace, monospace);
              letter-spacing: 0.14em;
              text-transform: uppercase;
            }
            .og-kicker::before {
              content: "";
              width: 52px;
              height: 3px;
              background: linear-gradient(90deg, #77f2c3, #60a5fa);
            }
            .og-title {
              max-width: 700px;
              margin: 36px 0 0;
              font-size: 78px;
              font-weight: 700;
              line-height: 0.92;
              letter-spacing: -0.058em;
              text-wrap: balance;
            }
            .og-description {
              max-width: 680px;
              margin: 28px 0 0;
              color: rgba(226, 232, 240, 0.78);
              font-size: 27px;
              font-weight: 450;
              line-height: 1.24;
              text-wrap: balance;
            }
            .og-meta {
              display: flex;
              align-items: center;
              gap: 16px;
              color: rgba(226, 232, 240, 0.62);
              font: 600 19px/1.2 var(--font-mono, "JetBrains Mono", ui-monospace, monospace);
              letter-spacing: 0.12em;
              text-transform: uppercase;
            }
            .og-year {
              color: #77f2c3;
            }
            .og-art {
              position: relative;
              align-self: stretch;
              min-height: 0;
            }
            .og-cover-frame {
              position: absolute;
              inset: 0;
              padding: 13px;
              border: 1px solid rgba(226, 232, 240, 0.2);
              background: rgba(15, 23, 42, 0.76);
              box-shadow: 18px 18px 0 rgba(96, 165, 250, 0.16), -14px -14px 0 rgba(119, 242, 195, 0.1);
            }
            .og-cover {
              display: block;
              width: 100%;
              height: 100%;
              object-fit: cover;
              filter: saturate(0.96) contrast(1.06);
            }
            .og-system {
              position: absolute;
              inset: 0;
              border: 1px solid rgba(226, 232, 240, 0.18);
              background:
                linear-gradient(135deg, rgba(119, 242, 195, 0.16), transparent 48%),
                rgba(15, 23, 42, 0.72);
              box-shadow: 18px 18px 0 rgba(96, 165, 250, 0.14);
            }
            .og-node { position: absolute; width: 18px; height: 18px; border-radius: 999px; background: #77f2c3; box-shadow: 0 0 32px rgba(119, 242, 195, 0.7); }
            .og-node:nth-child(1) { left: 60px; top: 84px; }
            .og-node:nth-child(2) { right: 70px; top: 128px; background: #60a5fa; }
            .og-node:nth-child(3) { left: 118px; bottom: 112px; background: #f59e0b; }
            .og-node:nth-child(4) { right: 96px; bottom: 88px; }
            .og-line { position: absolute; height: 2px; transform-origin: left center; background: linear-gradient(90deg, rgba(119,242,195,0.8), rgba(96,165,250,0.22)); }
            .og-line.one { left: 78px; top: 96px; width: 226px; transform: rotate(11deg); }
            .og-line.two { left: 132px; bottom: 122px; width: 214px; transform: rotate(-24deg); }
            .og-line.three { right: 82px; top: 148px; width: 246px; transform: rotate(108deg); }
          `,
        }}
      />
      <div className="og-grid" aria-hidden="true" />
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
            <span>Project</span>
            {data.year && <span className="og-year">{data.year}</span>}
          </div>
        </div>
        <aside className="og-art" aria-hidden="true">
          {data.coverImageUrl ? (
            <div className="og-cover-frame">
              <img className="og-cover" src={data.coverImageUrl} alt="" />
            </div>
          ) : (
            <div className="og-system">
              <span className="og-node" />
              <span className="og-node" />
              <span className="og-node" />
              <span className="og-node" />
              <span className="og-line one" />
              <span className="og-line two" />
              <span className="og-line three" />
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
