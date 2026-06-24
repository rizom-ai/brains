import type { JSX } from "preact";
import { MarkdownContent } from "@brains/ui-library";
import { z } from "@brains/utils/zod";
import type { MediaPageTemplate } from "@brains/media-page-composer";

export const PRODUCT_PRINTABLE_ATTACHMENT_TYPE = "printable";
export const PRODUCT_PRINTABLE_TEMPLATE_NAME = "products:product-printable";

export const productPrintableTemplateSchema = z.object({
  name: z.string().min(1),
  availability: z.string().optional(),
  body: z.string(),
  brandLabel: z.string().optional(),
});

export type ProductPrintableTemplateData = z.infer<
  typeof productPrintableTemplateSchema
>;

export const productPrintableTemplate: MediaPageTemplate = {
  name: PRODUCT_PRINTABLE_TEMPLATE_NAME,
  pluginId: "products",
  schema: productPrintableTemplateSchema,
  renderers: {
    pdf: renderProductPrintablePdf,
  },
};

function renderProductPrintablePdf(
  props: Record<string, unknown>,
): JSX.Element {
  const data = productPrintableTemplateSchema.parse(props);

  return (
    <main className="printable-document printable-product">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @import url("https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,650&family=IBM+Plex+Sans:wght@400;450;500;600&family=JetBrains+Mono:wght@400;500&display=swap");
            @page { size: A4; margin: 0; }
            html, body { margin: 0; padding: 0; background: #09100f; }
            body { color: #ecf7ef; font-family: var(--font-sans, "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif); }
            .printable-document {
              box-sizing: border-box;
              min-height: 297mm;
              padding: 18mm;
              background:
                radial-gradient(circle at 18% 12%, rgba(117, 255, 189, 0.13), transparent 28%),
                radial-gradient(circle at 88% 18%, rgba(255, 180, 87, 0.16), transparent 28%),
                linear-gradient(135deg, #09100f 0%, #14211d 52%, #0a1110 100%);
            }
            .product-shell {
              overflow: hidden;
              min-height: calc(297mm - 36mm);
              border: 1px solid rgba(236, 247, 239, 0.18);
              border-radius: 18px;
              background: rgba(255, 253, 244, 0.97);
              color: #111715;
              box-shadow: 0 26px 80px rgba(0, 0, 0, 0.35);
            }
            .product-hero {
              position: relative;
              padding: 13mm 13mm 12mm;
              background:
                linear-gradient(115deg, #10201d 0%, #173b32 58%, #f3a84f 58.2%, #f3a84f 61%, #fff7e8 61.2%, #fff7e8 100%);
              color: #f8fff9;
            }
            .product-hero::after {
              content: "";
              position: absolute;
              right: 13mm;
              bottom: -8mm;
              width: 31mm;
              height: 31mm;
              border: 1px solid rgba(17, 23, 21, 0.18);
              border-radius: 999px;
              background: #fffdf4;
              box-shadow: inset 0 0 0 9px #f3a84f, inset 0 0 0 10px rgba(17, 23, 21, 0.2);
            }
            .printable-kicker {
              margin: 0 0 17mm;
              color: #a9e8ca;
              font: 500 10px/1.35 var(--font-mono, "JetBrains Mono", ui-monospace, monospace);
              letter-spacing: 0.16em;
              text-transform: uppercase;
              overflow-wrap: anywhere;
            }
            .printable-title {
              max-width: 112mm;
              margin: 0;
              font-family: var(--font-heading, "Fraunces", Georgia, serif);
              font-size: 58px;
              font-weight: 650;
              line-height: 0.9;
              letter-spacing: -0.055em;
              text-wrap: balance;
            }
            .printable-meta {
              display: flex;
              flex-wrap: wrap;
              gap: 8px;
              margin: 8mm 0 0;
            }
            .printable-meta span {
              padding: 7px 10px;
              border: 1px solid rgba(169, 232, 202, 0.34);
              border-radius: 999px;
              background: rgba(169, 232, 202, 0.12);
              color: #dffceb;
              font: 500 10px/1 var(--font-mono, "JetBrains Mono", ui-monospace, monospace);
              letter-spacing: 0.12em;
              text-transform: uppercase;
            }
            .product-body-wrap {
              display: grid;
              grid-template-columns: 34mm 1fr;
              gap: 10mm;
              padding: 14mm 13mm 13mm;
            }
            .product-rail {
              border-right: 1px solid rgba(17, 23, 21, 0.16);
              padding-right: 8mm;
            }
            .product-rail-label {
              margin: 0;
              color: #55615c;
              font: 500 9px/1.5 var(--font-mono, "JetBrains Mono", ui-monospace, monospace);
              letter-spacing: 0.14em;
              text-transform: uppercase;
              writing-mode: vertical-rl;
              transform: rotate(180deg);
            }
            .printable-body {
              font-size: 14.2px;
              line-height: 1.62;
              color: #222a27;
            }
            .printable-body h1, .printable-body h2, .printable-body h3 {
              page-break-after: avoid;
              text-wrap: balance;
            }
            .printable-body h1 {
              margin: 0 0 7mm;
              font: 650 30px/1.05 var(--font-heading, "Fraunces", Georgia, serif);
              letter-spacing: -0.035em;
            }
            .printable-body h2 {
              display: flex;
              align-items: center;
              gap: 9px;
              margin: 10mm 0 4mm;
              color: #10201d;
              font: 650 23px/1.1 var(--font-heading, "Fraunces", Georgia, serif);
              letter-spacing: -0.028em;
            }
            .printable-body h2::before {
              content: "";
              flex: 0 0 16px;
              height: 16px;
              border-radius: 999px;
              background: #f3a84f;
              box-shadow: inset 0 0 0 5px #fffdf4, 0 0 0 1px rgba(17, 23, 21, 0.16);
            }
            .printable-body h3 {
              margin: 7mm 0 2mm;
              color: #173b32;
              font-size: 16px;
              font-weight: 600;
            }
            .printable-body p { margin: 0 0 4mm; }
            .printable-body ul {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 5px 12px;
              margin: 4mm 0 7mm;
              padding: 0;
              list-style: none;
            }
            .printable-body li {
              position: relative;
              padding: 7px 9px 7px 22px;
              border: 1px solid rgba(17, 23, 21, 0.12);
              border-radius: 10px;
              background: #f4f0e6;
            }
            .printable-body li::before {
              content: "";
              position: absolute;
              left: 9px;
              top: 13px;
              width: 6px;
              height: 6px;
              border-radius: 999px;
              background: #173b32;
            }
            .printable-body strong { color: #10201d; font-weight: 600; }
            .printable-footer {
              margin: 0 13mm 12mm 57mm;
              padding-top: 5mm;
              border-top: 1px solid rgba(17, 23, 21, 0.14);
              color: #66716b;
              font: 10px/1.45 var(--font-mono, "JetBrains Mono", ui-monospace, monospace);
            }
          `,
        }}
      />
      <section className="product-shell">
        <header className="product-hero">
          {data.brandLabel && (
            <p className="printable-kicker">{data.brandLabel}</p>
          )}
          <h1 className="printable-title">{data.name}</h1>
          {data.availability && (
            <div className="printable-meta">
              <span>{data.availability}</span>
            </div>
          )}
        </header>
        <div className="product-body-wrap">
          <aside className="product-rail" aria-hidden="true">
            <p className="product-rail-label">Product brief / capabilities</p>
          </aside>
          <MarkdownContent markdown={data.body} className="printable-body" />
        </div>
        {data.brandLabel && (
          <footer className="printable-footer">{data.brandLabel}</footer>
        )}
      </section>
    </main>
  );
}
