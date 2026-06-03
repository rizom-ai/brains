import type { JSX } from "preact";
import { z } from "@brains/utils";
import type { MediaPageTemplate } from "@brains/media-page-composer";

export const PRODUCT_OG_IMAGE_ATTACHMENT_TYPE = "og-image";
export const PRODUCT_OG_IMAGE_TEMPLATE_NAME = "products:og-image";

export const productOgImageTemplateSchema = z.object({
  name: z.string().min(1),
  tagline: z.string().optional(),
  availability: z.string().optional(),
  brandLabel: z.string().optional(),
});

export type ProductOgImageTemplateData = z.infer<
  typeof productOgImageTemplateSchema
>;

export const productOgImageTemplate: MediaPageTemplate = {
  name: PRODUCT_OG_IMAGE_TEMPLATE_NAME,
  pluginId: "products",
  schema: productOgImageTemplateSchema,
  renderers: {
    image: renderProductOgImage,
  },
};

function renderProductOgImage(props: Record<string, unknown>): JSX.Element {
  const data = productOgImageTemplateSchema.parse(props);

  return (
    <main className="og-card">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @import url("https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@450;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap");
            @page { size: 1200px 630px; margin: 0; }
            html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #130f1f; }
            body { font-family: var(--font-sans, "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif); }
            .og-card {
              box-sizing: border-box;
              position: relative;
              width: 1200px;
              height: 630px;
              overflow: hidden;
              padding: 60px 68px;
              color: #fff7ed;
              background:
                radial-gradient(circle at 82% 20%, rgba(251, 146, 60, 0.28), transparent 26%),
                radial-gradient(circle at 18% 78%, rgba(168, 85, 247, 0.22), transparent 30%),
                linear-gradient(135deg, #130f1f 0%, #221436 58%, #160d24 100%);
            }
            .og-card::before {
              content: "";
              position: absolute;
              inset: 32px;
              border: 1px solid rgba(255, 247, 237, 0.2);
              pointer-events: none;
            }
            .og-card::after {
              content: "";
              position: absolute;
              right: -110px;
              bottom: -150px;
              width: 520px;
              height: 520px;
              border-radius: 999px;
              border: 76px solid rgba(251, 146, 60, 0.16);
            }
            .og-layout {
              position: relative;
              z-index: 1;
              display: grid;
              grid-template-columns: 1fr 360px;
              gap: 64px;
              height: 100%;
            }
            .og-content { display: flex; min-width: 0; flex-direction: column; justify-content: space-between; }
            .og-kicker {
              margin: 0;
              color: #fdba74;
              font: 600 18px/1.2 var(--font-mono, "JetBrains Mono", ui-monospace, monospace);
              letter-spacing: 0.16em;
              text-transform: uppercase;
            }
            .og-name {
              max-width: 700px;
              margin: 34px 0 0;
              font-size: 96px;
              font-weight: 700;
              line-height: 0.88;
              letter-spacing: -0.068em;
              text-wrap: balance;
            }
            .og-tagline {
              max-width: 700px;
              margin: 30px 0 0;
              color: rgba(255, 247, 237, 0.76);
              font-size: 30px;
              font-weight: 450;
              line-height: 1.22;
              text-wrap: balance;
            }
            .og-meta {
              display: flex;
              align-items: center;
              gap: 14px;
              color: rgba(255, 247, 237, 0.62);
              font: 600 19px/1.2 var(--font-mono, "JetBrains Mono", ui-monospace, monospace);
              letter-spacing: 0.12em;
              text-transform: uppercase;
            }
            .og-status {
              padding: 9px 13px;
              color: #130f1f;
              background: #fdba74;
              border-radius: 999px;
            }
            .og-art {
              position: relative;
              align-self: stretch;
              min-height: 0;
            }
            .og-stack {
              position: absolute;
              inset: 0;
              display: grid;
              place-items: center;
              border: 1px solid rgba(255, 247, 237, 0.18);
              background:
                linear-gradient(160deg, rgba(255, 247, 237, 0.1), transparent 52%),
                rgba(255, 255, 255, 0.04);
              box-shadow: 18px 18px 0 rgba(168, 85, 247, 0.16), -14px -14px 0 rgba(251, 146, 60, 0.1);
            }
            .og-orbit {
              position: absolute;
              width: 250px;
              height: 250px;
              border-radius: 999px;
              border: 2px solid rgba(253, 186, 116, 0.46);
            }
            .og-orbit.two { width: 320px; height: 150px; transform: rotate(-28deg); border-color: rgba(216, 180, 254, 0.42); }
            .og-orbit.three { width: 160px; height: 320px; transform: rotate(34deg); border-color: rgba(255, 247, 237, 0.24); }
            .og-core {
              position: relative;
              width: 132px;
              height: 132px;
              border-radius: 30px;
              background: linear-gradient(135deg, #fdba74, #c084fc);
              box-shadow: 0 0 70px rgba(253, 186, 116, 0.38);
              transform: rotate(45deg);
            }
            .og-core::after {
              content: "";
              position: absolute;
              inset: 23px;
              border-radius: 20px;
              background: #130f1f;
            }
          `,
        }}
      />
      <section className="og-layout">
        <div className="og-content">
          <div>
            {data.brandLabel && <p className="og-kicker">{data.brandLabel}</p>}
            <h1 className="og-name">{data.name}</h1>
            {data.tagline && <p className="og-tagline">{data.tagline}</p>}
          </div>
          <div className="og-meta">
            <span>Product</span>
            {data.availability && (
              <span className="og-status">{data.availability}</span>
            )}
          </div>
        </div>
        <aside className="og-art" aria-hidden="true">
          <div className="og-stack">
            <span className="og-orbit" />
            <span className="og-orbit two" />
            <span className="og-orbit three" />
            <span className="og-core" />
          </div>
        </aside>
      </section>
    </main>
  );
}
